import { JsonStore, storePath } from "../store/jsonStore.js";
import { LedgerImpl } from "../ledger/index.js";

/**
 * Test-mode payment layer for AgentX.
 *
 * A real deployment settles fiat through Stripe/X402 on-chain; here we ship a
 * self-contained *test gateway* so the whole buy-credits → mint-X402 flow works
 * end-to-end with zero external accounts. Card behaviour mirrors Stripe's test
 * cards so the frontend is portable to a live processor with no code change:
 *   4242 4242 4242 4242 → approved
 *   4000 0000 0000 0002 → declined
 *   anything else        → invalid card
 */

export interface CreditPack {
  id: string;
  name: string;
  /** X402 credits granted on purchase. */
  credits: number;
  /** Price in USD cents (test mode — nothing is actually charged). */
  priceUsdCents: number;
  blurb: string;
}

export const PACKS: CreditPack[] = [
  { id: "starter", name: "Starter", credits: 5_000, priceUsdCents: 900, blurb: "Kick the tyres — post a few jobs, hire a worker." },
  { id: "pro", name: "Pro", credits: 30_000, priceUsdCents: 4_900, blurb: "Run the daemon loop and build reputation." },
  { id: "scale", name: "Scale", credits: 120_000, priceUsdCents: 14_900, blurb: "Fleet of agents trading around the clock." },
];

export interface Order {
  id: string;
  account: string;
  packId: string;
  credits: number;
  priceUsdCents: number;
  status: "paid" | "declined";
  reason?: string;
  cardLast4: string;
  createdAt: string;
  mode: "test";
}

interface OrdersState {
  seq: number;
  orders: Order[];
}

const CARD_APPROVED = "4242424242424242";
const CARD_DECLINED = "4000000000000002";

function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export type CheckoutResult =
  | { ok: true; order: Order; balance: number }
  | { ok: false; code: "invalid_pack" | "invalid_card" | "card_declined"; message: string };

/** Handles credit packs, the test card gateway, and X402 minting on success. */
export class CheckoutService {
  private readonly store: JsonStore<OrdersState>;

  constructor(
    private readonly ledger = new LedgerImpl(),
    path = storePath("orders")
  ) {
    this.store = new JsonStore<OrdersState>(path, { seq: 0, orders: [] });
  }

  packs(): CreditPack[] {
    return PACKS;
  }

  orders(): Order[] {
    return [...this.store.read().orders].reverse();
  }

  async checkout(input: {
    account: string;
    packId: string;
    card: string;
    createdAt: string;
  }): Promise<CheckoutResult> {
    const account = (input.account || "").trim();
    const pack = PACKS.find((p) => p.id === input.packId);
    if (!account) {
      return { ok: false, code: "invalid_card", message: "Account id is required." };
    }
    if (!pack) {
      return { ok: false, code: "invalid_pack", message: `Unknown pack '${input.packId}'.` };
    }

    const card = digits(input.card);
    const last4 = card.slice(-4).padStart(4, "•");

    if (card !== CARD_APPROVED && card !== CARD_DECLINED) {
      return {
        ok: false,
        code: "invalid_card",
        message: "Use test card 4242 4242 4242 4242 (approved) or 4000 0000 0000 0002 (declined).",
      };
    }

    if (card === CARD_DECLINED) {
      const order = this.record({
        account,
        pack,
        status: "declined",
        reason: "Your card was declined.",
        cardLast4: last4,
        createdAt: input.createdAt,
      });
      return { ok: false, code: "card_declined", message: "Your card was declined." };
    }

    // Approved → mint X402 credits to the account.
    this.ledger.mint(account, pack.credits);
    const order = this.record({
      account,
      pack,
      status: "paid",
      cardLast4: last4,
      createdAt: input.createdAt,
    });
    const balance = await this.ledger.balance(account);
    return { ok: true, order, balance };
  }

  private record(p: {
    account: string;
    pack: CreditPack;
    status: "paid" | "declined";
    reason?: string;
    cardLast4: string;
    createdAt: string;
  }): Order {
    let order!: Order;
    this.store.write((s) => {
      s.seq += 1;
      order = {
        id: `ord_${String(s.seq).padStart(5, "0")}`,
        account: p.account,
        packId: p.pack.id,
        credits: p.pack.credits,
        priceUsdCents: p.pack.priceUsdCents,
        status: p.status,
        reason: p.reason,
        cardLast4: p.cardLast4,
        createdAt: p.createdAt,
        mode: "test",
      };
      s.orders.push(order);
    });
    return order;
  }
}
