//! poi_gossip — Proof-of-Intent gossip anchor program.  (spec §4.1, §5, §6.2)
//!
//! Layer 1 of the protocol. Agents do not "search" — they BROADCAST structured
//! intents. This program is the on-chain anchor for that broadcast:
//!
//!   * charges a SOL micro-fee to the protocol treasury (spec §6.2 — the company
//!     earns SOL for infrastructure, never a cut of payment volume),
//!   * records a tiny, TTL-bounded `IntentRecord` (the wire fields from §4.1),
//!   * emits a `PoIDust` event — the on-chain "Intent Dust" discovery channel
//!     from §5 (`event PoIDust(agent, capabilityHash)`).
//!
//! ZERO CUSTODY (spec §3.1): this program only moves SOL infra fees. The USDC
//! bond is *referenced* (`bond_amount` + `payment_rail`) but never held, pooled,
//! or routed here — escrow is a separate, user-deployed contract.
//!
//! NOTE: build with the Anchor/Solana SBF toolchain (`anchor build`). The pinned
//! versions are in Cargo.toml.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

// Placeholder program ID — replace with your deploy keypair via `anchor keys sync`.
declare_id!("5ycmzEXUYMx4uRVu4hLqqNXRMzWhUu7KvMVeDfECE9o1");

/// Default broadcast micro-fee: 0.0001 SOL (spec §6.2).
pub const DEFAULT_BROADCAST_FEE_LAMPORTS: u64 = 100_000;
/// Hard cap on the stored DID string (bytes).
pub const MAX_DID_LEN: usize = 96;
/// TTL bounds (seconds) — sub-second gossip, but on-chain records live longer.
pub const MIN_TTL: u64 = 1;
pub const MAX_TTL: u64 = 86_400; // 24h

#[program]
pub mod poi_gossip {
    use super::*;

    /// One-time protocol config: admin + treasury + fee.
    pub fn initialize(ctx: Context<Initialize>, broadcast_fee_lamports: u64) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.treasury = ctx.accounts.treasury.key();
        cfg.broadcast_fee_lamports = if broadcast_fee_lamports == 0 {
            DEFAULT_BROADCAST_FEE_LAMPORTS
        } else {
            broadcast_fee_lamports
        };
        cfg.total_broadcasts = 0;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Admin-only: update the treasury or fee.
    pub fn set_params(
        ctx: Context<SetParams>,
        new_treasury: Option<Pubkey>,
        new_fee: Option<u64>,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        if let Some(t) = new_treasury {
            cfg.treasury = t;
        }
        if let Some(f) = new_fee {
            cfg.broadcast_fee_lamports = f;
        }
        Ok(())
    }

    /// Broadcast an intent: pay the SOL micro-fee, record it, emit Intent Dust.
    pub fn broadcast_intent(
        ctx: Context<BroadcastIntent>,
        intent_hash: [u8; 32],
        agent_did: String,
        bond_amount: u64,
        payment_rail: u8,
        ttl: u64,
    ) -> Result<()> {
        require!(agent_did.len() <= MAX_DID_LEN, GossipError::DidTooLong);
        require!((MIN_TTL..=MAX_TTL).contains(&ttl), GossipError::InvalidTtl);
        require!(bond_amount > 0, GossipError::ZeroBond);
        require!(payment_rail <= PaymentRail::UsdcBase as u8, GossipError::BadRail);

        // Pay the infra fee to treasury (SOL only — never user settlement funds).
        let cfg = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.treasury.key(),
            cfg.treasury,
            GossipError::WrongTreasury
        );
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.broadcaster.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            cfg.broadcast_fee_lamports,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let rec = &mut ctx.accounts.intent;
        rec.intent_hash = intent_hash;
        rec.agent_did = agent_did.clone();
        rec.broadcaster = ctx.accounts.broadcaster.key();
        rec.bond_amount = bond_amount;
        rec.payment_rail = payment_rail;
        rec.timestamp = now;
        rec.ttl = ttl;
        rec.bump = ctx.bumps.intent;

        let cfg = &mut ctx.accounts.config;
        cfg.total_broadcasts = cfg.total_broadcasts.saturating_add(1);

        // On-chain Intent Dust (spec §5) — indexers discover capability here.
        emit!(PoIDust {
            agent: ctx.accounts.broadcaster.key(),
            agent_did,
            intent_hash,
            bond_amount,
            payment_rail,
            timestamp: now,
            ttl,
        });
        Ok(())
    }

    /// Reclaim rent for an expired intent (ttl elapsed). Closes the record back
    /// to the original broadcaster.
    pub fn expire_intent(ctx: Context<ExpireIntent>) -> Result<()> {
        let rec = &ctx.accounts.intent;
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= rec.timestamp.saturating_add(rec.ttl as i64),
            GossipError::NotExpired
        );
        Ok(()) // account closed via `close = broadcaster` constraint
    }
}

/// Settlement rails referenced by a broadcast (spec §3.6). Stored as u8.
#[repr(u8)]
pub enum PaymentRail {
    UsdcSol = 0,
    RlusdXrp = 1,
    Xrp = 2,
    UsdcBase = 3,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub broadcast_fee_lamports: u64,
    pub total_broadcasts: u64,
    pub bump: u8,
}
impl Config {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct IntentRecord {
    pub intent_hash: [u8; 32],
    pub broadcaster: Pubkey,
    pub agent_did: String,
    pub bond_amount: u64,
    pub payment_rail: u8,
    pub timestamp: i64,
    pub ttl: u64,
    pub bump: u8,
}
impl IntentRecord {
    // 8 disc + 32 hash + 32 broadcaster + (4 + MAX_DID_LEN) string + 8 + 1 + 8 + 8 + 1
    pub const SPACE: usize = 8 + 32 + 32 + (4 + MAX_DID_LEN) + 8 + 1 + 8 + 8 + 1;
}

#[event]
pub struct PoIDust {
    pub agent: Pubkey,
    pub agent_did: String,
    pub intent_hash: [u8; 32],
    pub bond_amount: u64,
    pub payment_rail: u8,
    pub timestamp: i64,
    pub ttl: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = Config::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: treasury is only ever a SOL transfer destination.
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetParams<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(intent_hash: [u8; 32])]
pub struct BroadcastIntent<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = broadcaster,
        space = IntentRecord::SPACE,
        seeds = [b"intent", intent_hash.as_ref()],
        bump
    )]
    pub intent: Account<'info, IntentRecord>,
    #[account(mut)]
    pub broadcaster: Signer<'info>,
    /// CHECK: validated against config.treasury in the handler.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireIntent<'info> {
    #[account(
        mut,
        seeds = [b"intent", intent.intent_hash.as_ref()],
        bump = intent.bump,
        has_one = broadcaster,
        close = broadcaster
    )]
    pub intent: Account<'info, IntentRecord>,
    /// CHECK: receives the reclaimed rent; matched via has_one.
    #[account(mut)]
    pub broadcaster: UncheckedAccount<'info>,
}

#[error_code]
pub enum GossipError {
    #[msg("agent DID exceeds maximum length")]
    DidTooLong,
    #[msg("ttl out of bounds")]
    InvalidTtl,
    #[msg("bond amount must be greater than zero")]
    ZeroBond,
    #[msg("unknown payment rail")]
    BadRail,
    #[msg("treasury account does not match config")]
    WrongTreasury,
    #[msg("intent has not yet expired")]
    NotExpired,
}
