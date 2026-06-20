//! poi_subscription — SaaS tier management (SOL).  (spec §6.1, §6.2)
//!
//! Rail-access subscriptions. The company sells infrastructure access, not a
//! token and not a cut of payment volume (spec §1, §3.1): a wallet pays SOL to
//! the protocol treasury for a monthly tier, and the tier + expiry are recorded
//! on-chain. Free "Scout" needs no payment.
//!
//! Rail Miles (the loyalty program, §6.4) are deliberately NOT here — they are a
//! non-transferable, database-only bookkeeping entry in the commercial backend,
//! never on-chain, so they can never be mistaken for a token.
//!
//! Tiers + monthly price (spec §6.1):
//!   Scout   0 SOL    Runner  5 SOL    Relay  25 SOL    Builder  50 SOL
//!
//! NOTE: build with the Anchor/Solana SBF toolchain (`anchor build`).

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("9MeEYCFExtHAFiXa4ZFmW4nh34n3mk2hyqm91jDwSbEE");

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
/// 30-day subscription window, in seconds.
pub const PERIOD_SECONDS: i64 = 30 * 86_400;

#[program]
pub mod poi_subscription {
    use super::*;

    /// One-time config: admin + SOL treasury.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.treasury = ctx.accounts.treasury.key();
        cfg.total_subscriptions = 0;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Subscribe (or upgrade/renew) to `tier`. Pays the tier's monthly SOL price
    /// to the treasury and sets the expiry one period out. Scout is free and
    /// simply records the tier with a rolling expiry.
    pub fn subscribe(ctx: Context<Subscribe>, tier: u8) -> Result<()> {
        let price = tier_price_lamports(tier)?;
        let cfg = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.treasury.key(), cfg.treasury, SubError::WrongTreasury);

        if price > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.subscriber.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                price,
            )?;
        }

        let now = Clock::get()?.unix_timestamp;
        let sub = &mut ctx.accounts.subscription;
        let is_new = sub.owner == Pubkey::default();
        sub.owner = ctx.accounts.subscriber.key();
        sub.tier = tier;
        // Extend from the later of now or the existing expiry (renewals stack).
        let base = core::cmp::max(now, sub.expiry);
        sub.expiry = if tier == Tier::Scout as u8 { now + PERIOD_SECONDS } else { base + PERIOD_SECONDS };
        sub.bump = ctx.bumps.subscription;

        if is_new {
            let cfg = &mut ctx.accounts.config;
            cfg.total_subscriptions = cfg.total_subscriptions.saturating_add(1);
        }

        emit!(Subscribed { subscriber: sub.owner, tier, expiry: sub.expiry, paid_lamports: price });
        Ok(())
    }
}

/// SaaS tiers (spec §6.1). Stored as u8.
#[repr(u8)]
pub enum Tier {
    Scout = 0,
    Runner = 1,
    Relay = 2,
    Builder = 3,
}

/// Monthly price in lamports for a tier; errors on an unknown tier.
pub fn tier_price_lamports(tier: u8) -> Result<u64> {
    let sol = match tier {
        x if x == Tier::Scout as u8 => 0,
        x if x == Tier::Runner as u8 => 5,
        x if x == Tier::Relay as u8 => 25,
        x if x == Tier::Builder as u8 => 50,
        _ => return err!(SubError::UnknownTier),
    };
    Ok(sol * LAMPORTS_PER_SOL)
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub total_subscriptions: u64,
    pub bump: u8,
}
impl Config {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct Subscription {
    pub owner: Pubkey,
    pub tier: u8,
    pub expiry: i64,
    pub bump: u8,
}
impl Subscription {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 1;
}

#[event]
pub struct Subscribed {
    pub subscriber: Pubkey,
    pub tier: u8,
    pub expiry: i64,
    pub paid_lamports: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = Config::SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: SOL transfer destination only.
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = subscriber,
        space = Subscription::SPACE,
        seeds = [b"sub", subscriber.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    #[account(mut)]
    pub subscriber: Signer<'info>,
    /// CHECK: validated against config.treasury in the handler.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum SubError {
    #[msg("unknown subscription tier")]
    UnknownTier,
    #[msg("treasury account does not match config")]
    WrongTreasury,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tier_prices_match_spec_6_1() {
        assert_eq!(tier_price_lamports(Tier::Scout as u8).unwrap(), 0);
        assert_eq!(tier_price_lamports(Tier::Runner as u8).unwrap(), 5 * LAMPORTS_PER_SOL);
        assert_eq!(tier_price_lamports(Tier::Relay as u8).unwrap(), 25 * LAMPORTS_PER_SOL);
        assert_eq!(tier_price_lamports(Tier::Builder as u8).unwrap(), 50 * LAMPORTS_PER_SOL);
    }

    #[test]
    fn unknown_tier_is_rejected() {
        assert!(tier_price_lamports(4).is_err());
        assert!(tier_price_lamports(255).is_err());
    }
}
