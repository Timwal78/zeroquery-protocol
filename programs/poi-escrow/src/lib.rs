//! poi_escrow — non-custodial x402 intent bonds.  (spec §3.1, §4.3, §3.5)
//!
//! Layer 3 settlement. An agent broadcasting an intent stakes a USDC bond; the
//! bond releases to the responder on a verified fulfillment, returns to the
//! broadcaster on expiry, or is slashed on a proven false fulfillment.
//!
//! NON-CUSTODIAL BY CONSTRUCTION (spec §3.1):
//!   * The company holds no key here. There is NO admin instruction that can
//!     move, drain, or redirect bonded funds. Funds leave the vault only via
//!     the three coded outcomes below.
//!   * The vault token account is owned by a program-derived address (the
//!     `Bond` PDA). No human signer controls it.
//!   * Release/slash require the bond's recorded `verifier` to sign. In Phase 1
//!     the verifier is an oracle/attestation key; in Phase 2 it is replaced by
//!     the ZK provenance verifier program (spec §3.5) via CPI — still no human.
//!
//! COIN ISOLATION (spec §3.6):
//!   The escrow only accepts the single `mint` the broadcaster passes at bond
//!   creation. The vault is seeded with `intent_hash` AND the mint address so
//!   it is impossible for the vault to receive tokens of a different mint than
//!   the one locked at open time. All resolution paths (`fulfill`, `slash`,
//!   `expire`) validate `bond.mint == mint` via the `has_one` constraint before
//!   any transfer executes. The program therefore NEVER holds SPL tokens from
//!   more than one mint per bond, and mixing mints across bonds is structurally
//!   impossible.
//!
//! Outcomes:
//!   fulfill  -> vault → responder   (verifier attests a valid provenance proof)
//!   expire   -> vault → broadcaster (anyone may crank once `expiry` passes)
//!   slash    -> vault → slash_sink  (verifier attests a false fulfillment)

#![deny(unused_must_use)]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

// Placeholder program ID — replace with your deploy keypair via `anchor keys sync`.
declare_id!("G41hFoSfYJ6ETtvxVayZtFx4oUVwWY7ctsgUB1BQBtPH");

#[program]
pub mod poi_escrow {
    use super::*;

    /// Open a bond: broadcaster deposits `amount` of `mint` into the vault.
    ///
    /// `verifier`   — key allowed to attest fulfillment/slash (oracle, later ZK).
    /// `responder`  — the agent eligible to receive the bond on fulfillment.
    /// `slash_sink` — token account that receives a slashed bond (burn addr / DAO).
    /// `expiry`     — unix seconds after which the broadcaster can reclaim.
    pub fn open_bond(
        ctx: Context<OpenBond>,
        intent_hash: [u8; 32],
        amount: u64,
        expiry: i64,
        verifier: Pubkey,
        responder: Pubkey,
        slash_sink: Pubkey,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        let now = Clock::get()?.unix_timestamp;
        require!(expiry > now, EscrowError::ExpiryInPast);

        // Pull the bond from the broadcaster into the program-owned vault.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.broadcaster_ata.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.broadcaster.to_account_info(),
                },
            ),
            amount,
        )?;

        let bond = &mut ctx.accounts.bond;
        bond.intent_hash = intent_hash;
        bond.broadcaster = ctx.accounts.broadcaster.key();
        bond.responder = responder;
        bond.verifier = verifier;
        bond.slash_sink = slash_sink;
        bond.mint = ctx.accounts.mint.key();
        bond.amount = amount;
        bond.expiry = expiry;
        bond.state = BondState::Open as u8;
        bond.bump = ctx.bumps.bond;
        bond.vault_bump = ctx.bumps.vault;

        emit!(BondOpened { intent_hash, broadcaster: bond.broadcaster, responder, amount, expiry });
        Ok(())
    }

    /// Verifier attests a valid provenance proof: release the bond to responder.
    pub fn fulfill(ctx: Context<Resolve>, intent_hash: [u8; 32], proof_hash: [u8; 32]) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == BondState::Open as u8, EscrowError::NotOpen);
        require_keys_eq!(ctx.accounts.destination_owner.key(), bond.responder, EscrowError::WrongResponder);

        payout(&ctx, intent_hash)?;

        let bond = &mut ctx.accounts.bond;
        bond.state = BondState::Fulfilled as u8;
        bond.proof_hash = proof_hash;
        emit!(BondResolved { intent_hash, outcome: BondState::Fulfilled as u8, amount: bond.amount });
        Ok(())
    }

    /// Verifier attests a false fulfillment: slash the bond to the slash sink.
    pub fn slash(ctx: Context<Resolve>, intent_hash: [u8; 32], proof_hash: [u8; 32]) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == BondState::Open as u8, EscrowError::NotOpen);
        require_keys_eq!(ctx.accounts.destination_owner.key(), bond.slash_sink, EscrowError::WrongSink);

        payout(&ctx, intent_hash)?;

        let bond = &mut ctx.accounts.bond;
        bond.state = BondState::Slashed as u8;
        bond.proof_hash = proof_hash;
        emit!(BondResolved { intent_hash, outcome: BondState::Slashed as u8, amount: bond.amount });
        Ok(())
    }

    /// Permissionless crank: after `expiry`, return the bond to the broadcaster.
    pub fn expire(ctx: Context<Expire>, intent_hash: [u8; 32]) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == BondState::Open as u8, EscrowError::NotOpen);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= bond.expiry, EscrowError::NotExpired);
        require_keys_eq!(ctx.accounts.broadcaster.key(), bond.broadcaster, EscrowError::WrongBroadcaster);

        // Drain the full vault balance (robust to stray token donations — see payout).
        let amount = ctx.accounts.vault.amount;
        let seeds: &[&[u8]] = &[b"bond", intent_hash.as_ref(), &[bond.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.broadcaster_ata.to_account_info(),
                    authority: ctx.accounts.bond.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        close_vault_to(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.broadcaster.to_account_info(),
            &ctx.accounts.bond,
            intent_hash,
        )?;

        let bond = &mut ctx.accounts.bond;
        bond.state = BondState::Expired as u8;
        emit!(BondResolved { intent_hash, outcome: BondState::Expired as u8, amount });
        Ok(())
    }
}

/// Shared payout for verifier-attested outcomes (fulfill / slash).
///
/// Transfers the vault's ENTIRE current balance, not the recorded `bond.amount`.
/// The vault is a public SPL account, so an attacker can donate dust into it; if
/// we only moved `bond.amount`, the residual would make the subsequent
/// `close_account` revert and lock the bond forever (a griefing DoS). Draining
/// the full balance keeps the close — and therefore every resolution path —
/// always reachable.
fn payout(ctx: &Context<Resolve>, intent_hash: [u8; 32]) -> Result<()> {
    let amount = ctx.accounts.vault.amount;
    let bump = ctx.accounts.bond.bump;
    let seeds: &[&[u8]] = &[b"bond", intent_hash.as_ref(), &[bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.destination_ata.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    close_vault_to(
        &ctx.accounts.token_program,
        &ctx.accounts.vault,
        &ctx.accounts.rent_recipient.to_account_info(),
        &ctx.accounts.bond,
        intent_hash,
    )
}

/// Close the emptied vault token account, returning its rent lamports.
fn close_vault_to<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    rent_to: &AccountInfo<'info>,
    bond: &Account<'info, Bond>,
    intent_hash: [u8; 32],
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"bond", intent_hash.as_ref(), &[bond.bump]];
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_to.clone(),
            authority: bond.to_account_info(),
        },
        &[seeds],
    ))
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BondState {
    Open = 0,
    Fulfilled = 1,
    Expired = 2,
    Slashed = 3,
}

#[account]
pub struct Bond {
    pub intent_hash: [u8; 32],
    pub broadcaster: Pubkey,
    pub responder: Pubkey,
    pub verifier: Pubkey,
    pub slash_sink: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub expiry: i64,
    pub proof_hash: [u8; 32],
    pub state: u8,
    pub bump: u8,
    pub vault_bump: u8,
}
impl Bond {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 32 + 1 + 1 + 1;
}

#[event]
pub struct BondOpened {
    pub intent_hash: [u8; 32],
    pub broadcaster: Pubkey,
    pub responder: Pubkey,
    pub amount: u64,
    pub expiry: i64,
}

#[event]
pub struct BondResolved {
    pub intent_hash: [u8; 32],
    pub outcome: u8,
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(intent_hash: [u8; 32])]
pub struct OpenBond<'info> {
    #[account(
        init,
        payer = broadcaster,
        space = Bond::SPACE,
        seeds = [b"bond", intent_hash.as_ref()],
        bump
    )]
    pub bond: Account<'info, Bond>,
    #[account(
        init,
        payer = broadcaster,
        seeds = [b"vault", intent_hash.as_ref()],
        bump,
        token::mint = mint,
        token::authority = bond
    )]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub broadcaster: Signer<'info>,
    #[account(
        mut,
        constraint = broadcaster_ata.mint == mint.key() @ EscrowError::MintMismatch,
        constraint = broadcaster_ata.owner == broadcaster.key() @ EscrowError::WrongOwner
    )]
    pub broadcaster_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Verifier-attested resolution (fulfill or slash).
#[derive(Accounts)]
#[instruction(intent_hash: [u8; 32])]
pub struct Resolve<'info> {
    #[account(
        mut,
        seeds = [b"bond", intent_hash.as_ref()],
        bump = bond.bump,
        has_one = verifier @ EscrowError::WrongVerifier,
        has_one = mint @ EscrowError::MintMismatch
    )]
    pub bond: Account<'info, Bond>,
    #[account(
        mut,
        seeds = [b"vault", intent_hash.as_ref()],
        bump = bond.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// The verifier attesting the outcome (oracle now, ZK program later).
    pub verifier: Signer<'info>,
    /// CHECK: matched against bond.responder / bond.slash_sink in handlers.
    pub destination_owner: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = destination_ata.mint == bond.mint @ EscrowError::MintMismatch,
        constraint = destination_ata.owner == destination_owner.key() @ EscrowError::WrongOwner
    )]
    pub destination_ata: Account<'info, TokenAccount>,
    /// CHECK: receives reclaimed vault rent; any account is acceptable.
    #[account(mut)]
    pub rent_recipient: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(intent_hash: [u8; 32])]
pub struct Expire<'info> {
    #[account(
        mut,
        seeds = [b"bond", intent_hash.as_ref()],
        bump = bond.bump,
        has_one = broadcaster @ EscrowError::WrongBroadcaster
    )]
    pub bond: Account<'info, Bond>,
    #[account(
        mut,
        seeds = [b"vault", intent_hash.as_ref()],
        bump = bond.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: matched against bond.broadcaster via has_one; receives funds + rent.
    #[account(mut)]
    pub broadcaster: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = broadcaster_ata.mint == bond.mint @ EscrowError::MintMismatch,
        constraint = broadcaster_ata.owner == bond.broadcaster @ EscrowError::WrongOwner
    )]
    pub broadcaster_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum EscrowError {
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("expiry must be in the future")]
    ExpiryInPast,
    #[msg("bond is not in the Open state")]
    NotOpen,
    #[msg("bond has not yet expired")]
    NotExpired,
    #[msg("signer is not the bond verifier")]
    WrongVerifier,
    #[msg("destination is not the matched responder")]
    WrongResponder,
    #[msg("destination is not the configured slash sink")]
    WrongSink,
    #[msg("account is not the bond broadcaster")]
    WrongBroadcaster,
    #[msg("token account mint does not match")]
    MintMismatch,
    #[msg("token account owner does not match")]
    WrongOwner,
}
