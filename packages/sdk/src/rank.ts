import type { ReputationState } from "./resolver.js";

/**
 * Computes a normalized IntentRank score (0-100) based on on-chain reputation.
 * Mathematically penalizes failures heavily to mitigate Sybil and griefing attacks.
 */
export function calculateIntentRank(
  reputation: ReputationState | null,
  now: number = Math.floor(Date.now() / 1000)
): number {
  if (!reputation) return 0;
  
  const { score, fulfilled, failed, lastActive } = reputation;
  const total = fulfilled + failed;
  
  if (total === 0) {
    // Untested accounts with some staked score get a minimal baseline rank
    return Math.min(10, score); 
  }
  
  // Velocity multiplier: failed intents penalize 2.5x
  const netSuccess = Math.max(0, fulfilled - (failed * 2.5));
  const velocity = netSuccess / total;
  
  // Decay: reduce score by 1% per day of inactivity after a 7-day grace period
  const daysInactive = Math.max(0, (now - lastActive) / 86400);
  const decayFactor = Math.max(0.1, 1 - (Math.max(0, daysInactive - 7) * 0.01));
  
  // Score component: logarithmic scaling to prevent rich-get-richer dominance
  // e.g., score of 100k -> log10(100000)*10 = 50.
  const scoreComponent = Math.min(50, Math.log10(Math.max(1, score)) * 10);
  
  // Rank combines historical reliability (50%) and staked score value (50%)
  const rank = (scoreComponent + (velocity * 50)) * decayFactor;
  
  // Return clamped 0-100 integer
  return Math.max(0, Math.min(100, Math.round(rank)));
}
