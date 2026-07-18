import type { Ledger } from "../orchestrator/types.js";
import { JsonStore, storePath } from "../store/jsonStore.js";

interface LedgerState {
  /** agentId -> spendable X402 balance. */
  balances: Record<string, number>;
  /** jobId -> funds locked in escrow (source + amount). */
  escrows: Record<string, { from: string; amount: number }>;
}

/**
 * X402 settlement rail with escrow — the agent-to-agent value layer.
 *
 * Balances and locked escrows are persisted so a job's funds survive a process
 * restart mid-flight. `mint` is a demo/bootstrap helper (not part of the public
 * Ledger contract) used to seed initial balances; a production rail would fund
 * accounts from the real X402 chain instead.
 */
export class LedgerImpl implements Ledger {
  private readonly store: JsonStore<LedgerState>;

  constructor(path = storePath("ledger")) {
    this.store = new JsonStore<LedgerState>(path, { balances: {}, escrows: {} });
  }

  async balance(agentId: string): Promise<number> {
    return this.store.read().balances[agentId] ?? 0;
  }

  /** Bootstrap helper: credit an account out of thin air (demo only). */
  mint(agentId: string, amount: number): void {
    this.store.write((s) => {
      s.balances[agentId] = (s.balances[agentId] ?? 0) + amount;
    });
  }

  async escrow(from: string, amount: number, jobId: string): Promise<void> {
    if (amount < 0) throw new Error("escrow amount must be non-negative");
    const bal = this.store.read().balances[from] ?? 0;
    if (bal < amount) {
      throw new Error(
        `insufficient funds: ${from} has ${bal} X402, needs ${amount}`
      );
    }
    if (this.store.read().escrows[jobId]) {
      throw new Error(`job ${jobId} already has funds in escrow`);
    }
    this.store.write((s) => {
      s.balances[from] = (s.balances[from] ?? 0) - amount;
      s.escrows[jobId] = { from, amount };
    });
  }

  async release(jobId: string, to: string): Promise<void> {
    const lock = this.store.read().escrows[jobId];
    if (!lock) throw new Error(`no escrow for job ${jobId}`);
    this.store.write((s) => {
      s.balances[to] = (s.balances[to] ?? 0) + lock.amount;
      delete s.escrows[jobId];
    });
  }

  async refund(jobId: string, to: string): Promise<void> {
    const lock = this.store.read().escrows[jobId];
    if (!lock) throw new Error(`no escrow for job ${jobId}`);
    this.store.write((s) => {
      s.balances[to] = (s.balances[to] ?? 0) + lock.amount;
      delete s.escrows[jobId];
    });
  }

  async transfer(from: string, to: string, amount: number): Promise<void> {
    if (amount < 0) throw new Error("transfer amount must be non-negative");
    const bal = this.store.read().balances[from] ?? 0;
    if (bal < amount) {
      throw new Error(
        `insufficient funds: ${from} has ${bal} X402, needs ${amount}`
      );
    }
    this.store.write((s) => {
      s.balances[from] = (s.balances[from] ?? 0) - amount;
      s.balances[to] = (s.balances[to] ?? 0) + amount;
    });
  }

  /** Full balance sheet snapshot — for reporting / CLI. */
  snapshot(): LedgerState {
    return this.store.read();
  }
}
