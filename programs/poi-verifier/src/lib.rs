use anchor_lang::prelude::*;
use poi_escrow::cpi::accounts::Resolve;
use poi_escrow::program::PoiEscrow;
use poi_escrow::{self, Bond};

// Placeholder program ID
declare_id!("Verif1er11111111111111111111111111111111111");

#[program]
pub mod poi_verifier {
    use super::*;

    /// Initialize the global verifier configuration with the ZK prover Image ID.
    pub fn initialize(ctx: Context<Initialize>, image_id: [u8; 32]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.image_id = image_id;
        Ok(())
    }

    /// Submit a ZK proof to be verified. On success, it invokes `poi-escrow` to fulfill or slash.
    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        intent_hash: [u8; 32],
        proof_hash: [u8; 32],
        outcome: u8, // 1 = fulfill, 3 = slash
        _proof_data: Vec<u8>, // The actual SP1 SNARK proof data
    ) -> Result<()> {
        // Step 1: Verify the ZK proof against the stored `config.image_id`.
        // (In a full SP1 integration, we would invoke the SP1 Groth16/Plonk verifier program here).
        // For Phase 2 scaffolding, we mock the success if proof_data is non-empty.
        require!(!_proof_data.is_empty(), VerifierError::InvalidProof);

        // Step 2: Sign the CPI using the verifier PDA.
        let bump = ctx.bumps.verifier_authority;
        let seeds: &[&[u8]] = &[b"verifier_authority", &[bump]];
        let signer = &[seeds];

        let cpi_program = ctx.accounts.escrow_program.to_account_info();
        let cpi_accounts = Resolve {
            bond: ctx.accounts.bond.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            verifier: ctx.accounts.verifier_authority.to_account_info(),
            destination_owner: ctx.accounts.destination_owner.to_account_info(),
            destination_ata: ctx.accounts.destination_ata.to_account_info(),
            rent_recipient: ctx.accounts.rent_recipient.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };

        if outcome == 1 {
            // Fulfill
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            poi_escrow::cpi::fulfill(cpi_ctx, intent_hash, proof_hash)?;
        } else if outcome == 3 {
            // Slash
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            poi_escrow::cpi::slash(cpi_ctx, intent_hash, proof_hash)?;
        } else {
            return err!(VerifierError::InvalidOutcome);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, VerifierConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitProof<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, VerifierConfig>,
    /// The PDA that acts as the verifier signature for the escrow program.
    /// CHECK: PDA used purely for CPI signing.
    #[account(
        seeds = [b"verifier_authority"],
        bump
    )]
    pub verifier_authority: UncheckedAccount<'info>,
    
    // Escrow CPI accounts
    #[account(mut)]
    pub bond: Account<'info, Bond>,
    /// CHECK: Validated by poi_escrow
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: Validated by poi_escrow
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Validated by poi_escrow
    pub destination_owner: UncheckedAccount<'info>,
    /// CHECK: Validated by poi_escrow
    #[account(mut)]
    pub destination_ata: UncheckedAccount<'info>,
    /// CHECK: Validated by poi_escrow
    #[account(mut)]
    pub rent_recipient: UncheckedAccount<'info>,
    
    pub token_program: UncheckedAccount<'info>, // Validated by poi_escrow
    pub escrow_program: Program<'info, PoiEscrow>,
}

#[account]
pub struct VerifierConfig {
    pub admin: Pubkey,
    pub image_id: [u8; 32], // The SP1 guest program image ID
}

#[error_code]
pub enum VerifierError {
    #[msg("The provided ZK proof is invalid or malformed.")]
    InvalidProof,
    #[msg("The specified outcome must be 1 (fulfill) or 3 (slash).")]
    InvalidOutcome,
}
