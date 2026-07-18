import type { IncomingMessage, ServerResponse } from "node:http";
import { useFacilitator } from "x402/verify";
import {
  processPriceToAtomicAmount,
  findMatchingPaymentRequirements,
  toJsonSafe,
} from "x402/shared";
import { exact } from "x402/schemes";
import { settleResponseHeader } from "x402/types";
import type { PaymentRequirements, Network } from "x402/types";
import { LedgerImpl } from "../ledger/index.js";
import { JsonStore, storePath } from "../store/jsonStore.js";
import { PACKS, type CreditPack } from "./checkout.js";

/**
 * Real x402 settlement for AgentX credit purchases.
 *
 * There are no cards here. A buyer pays **USDC on Base** over Coinbase's x402
 * protocol: the server answers an un-paid request with `402 Payment Required`
 * and a set of payment requirements, the buyer signs a gasless EIP-3009
 * `transferWithAuthorization`, and the server hands that signature to a
 * **facilitator** which verifies and settles it on-chain. On success the paid
 * USDC lands in `X402_PAY_TO` and the buyer's account is credited in the
 * internal X402 ledger.
 *
 * The server holds NO private key — settlement is delegated to the facilitator
 * (free testnet facilitator on Base Sepolia, or the Coinbase CDP facilitator on
 * Base mainnet). Configure with env:
 *   X402_NETWORK          base-sepolia | base            (default base-sepolia)
 *   X402_PAY_TO           0x… wallet that receives USDC   (required for live pay)
 *   X402_FACILITATOR_URL  https://x402.org/facilitator    (default; testnet)
 */

const X402_VERSION = 1;

export interface X402Config {
  network: Network;
  payTo: string;
  facilitatorUrl: string;
}

export function loadX402Config(): X402Config {
  const network = (process.env.X402_NETWORK || "base-sepolia") as Network;
  const payTo = (process.env.X402_PAY_TO || "").trim();
  const facilitatorUrl =
    (process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator").trim();
  return { network, payTo, facilitatorUrl };
}

/** USDC settlement record — replaces the old card Order. */
export interface Settlement {
  id: string;
  account: string;
  packId: string;
  credits: number;
  /** Price actually charged, in USD (mirrors the atomic USDC amount). */
  priceUsd: string;
  network: Network;
  asset: string;
  /** On-chain settlement tx hash. */
  transaction: string;
  /** Buyer wallet that signed the payment. */
  payer: string;
  status: "settled";
  createdAt: string;
}

interface SettlementState {
  seq: number;
  settlements: Settlement[];
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Builds the x402 `accepts` array for a pack: what the buyer must pay and where.
 */
function buildRequirements(
  pack: CreditPack,
  cfg: X402Config,
  resource: string,
): { requirements: PaymentRequirements[] } | { error: string } {
  const price = usd(pack.priceUsdCents);
  const atomic = processPriceToAtomicAmount(price, cfg.network);
  if ("error" in atomic) return { error: atomic.error };
  const { maxAmountRequired, asset } = atomic;

  const requirements: PaymentRequirements[] = [
    {
      scheme: "exact",
      network: cfg.network,
      maxAmountRequired,
      resource: resource as `${string}://${string}`,
      description: `AgentX ${pack.name} — ${pack.credits.toLocaleString()} X402 credits`,
      mimeType: "application/json",
      payTo: cfg.payTo,
      maxTimeoutSeconds: 300,
      asset: asset.address,
      outputSchema: undefined,
      extra: (asset as { eip712?: Record<string, unknown> }).eip712,
    },
  ];
  return { requirements };
}

export class X402Checkout {
  private readonly cfg: X402Config;
  private readonly facilitator: ReturnType<typeof useFacilitator>;
  private readonly store: JsonStore<SettlementState>;

  constructor(private readonly ledger: LedgerImpl, cfg = loadX402Config()) {
    this.cfg = cfg;
    this.facilitator = useFacilitator({ url: cfg.facilitatorUrl as `${string}://${string}` });
    this.store = new JsonStore<SettlementState>(storePath("x402-settlements"), {
      seq: 0,
      settlements: [],
    });
  }

  config(): X402Config {
    return this.cfg;
  }

  packs(): CreditPack[] {
    return PACKS;
  }

  settlements(): Settlement[] {
    return this.store.read().settlements.slice(-25).reverse();
  }

  private record(s: Omit<Settlement, "id">): Settlement {
    let saved!: Settlement;
    this.store.write((state) => {
      state.seq += 1;
      saved = { id: `stl_${state.seq}`, ...s };
      state.settlements.push(saved);
    });
    return saved;
  }

  /**
   * Handles `POST /api/x402/buy/:packId`.
   * No X-PAYMENT header → 402 + requirements. With header → verify, settle, mint.
   */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    packId: string,
    account: string,
    resource: string,
  ): Promise<void> {
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack) return this.json(res, 404, { error: `unknown pack: ${packId}` });
    if (!account) return this.json(res, 400, { error: "account required" });
    if (!this.cfg.payTo) {
      return this.json(res, 503, {
        error: "x402 not configured: set X402_PAY_TO to your receiving wallet",
      });
    }

    const built = buildRequirements(pack, this.cfg, resource);
    if ("error" in built) return this.json(res, 500, { error: built.error });
    const { requirements } = built;

    const header = req.headers["x-payment"];
    const paymentHeader = Array.isArray(header) ? header[0] : header;

    // Step 1 — no payment yet: challenge the buyer.
    if (!paymentHeader) {
      return this.json(res, 402, {
        x402Version: X402_VERSION,
        error: "X-PAYMENT header is required",
        accepts: requirements.map((r) => toJsonSafe(r)),
      });
    }

    // Step 2 — decode the signed payment.
    let payment;
    try {
      payment = exact.evm.decodePayment(paymentHeader);
    } catch (err) {
      return this.json(res, 402, {
        x402Version: X402_VERSION,
        error: `invalid X-PAYMENT header: ${(err as Error).message}`,
        accepts: requirements.map((r) => toJsonSafe(r)),
      });
    }

    const selected = findMatchingPaymentRequirements(requirements, payment);
    if (!selected) {
      return this.json(res, 402, {
        x402Version: X402_VERSION,
        error: "no matching payment requirements",
        accepts: requirements.map((r) => toJsonSafe(r)),
      });
    }

    // Step 3 — verify signature/amount via the facilitator.
    const verification = await this.facilitator.verify(payment, selected);
    if (!verification.isValid) {
      return this.json(res, 402, {
        x402Version: X402_VERSION,
        error: verification.invalidReason || "payment verification failed",
        accepts: requirements.map((r) => toJsonSafe(r)),
      });
    }

    // Step 4 — settle on-chain via the facilitator.
    const settlement = await this.facilitator.settle(payment, selected);
    if (!settlement.success) {
      return this.json(res, 402, {
        x402Version: X402_VERSION,
        error: settlement.errorReason || "settlement failed",
        accepts: requirements.map((r) => toJsonSafe(r)),
      });
    }

    // Step 5 — money is on-chain: mint credits into the X402 ledger.
    this.ledger.mint(account, pack.credits);
    const balance = await this.ledger.balance(account);
    const record = this.record({
      account,
      packId: pack.id,
      credits: pack.credits,
      priceUsd: usd(pack.priceUsdCents),
      network: this.cfg.network,
      asset: selected.asset,
      transaction: settlement.transaction ?? "",
      payer: settlement.payer ?? "",
      status: "settled",
      createdAt: new Date().toISOString(),
    });

    res.setHeader("X-PAYMENT-RESPONSE", settleResponseHeader(settlement));
    return this.json(res, 200, { ok: true, settlement: record, balance });
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  }
}
