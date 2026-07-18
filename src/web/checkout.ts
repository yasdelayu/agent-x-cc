/**
 * Credit pack catalog for AgentX.
 *
 * A pack is a bundle of X402 ledger credits with a USD list price. Credits are
 * purchased with real USDC on Base over the x402 protocol — see ./x402.ts for
 * the settlement flow. There are no cards and no fiat processor.
 */

export interface CreditPack {
  id: string;
  name: string;
  /** X402 credits granted on purchase. */
  credits: number;
  /** List price in USD cents; charged 1:1 as USDC on Base. */
  priceUsdCents: number;
  blurb: string;
}

export const PACKS: CreditPack[] = [
  { id: "starter", name: "Starter", credits: 5_000, priceUsdCents: 900, blurb: "Kick the tyres — post a few jobs, hire a worker." },
  { id: "pro", name: "Pro", credits: 30_000, priceUsdCents: 4_900, blurb: "Run the daemon loop and build reputation." },
  { id: "scale", name: "Scale", credits: 120_000, priceUsdCents: 14_900, blurb: "Fleet of agents trading around the clock." },
];
