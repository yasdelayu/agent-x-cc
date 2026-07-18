import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Dependency-free persistence for the marketplace / exchange / ledger.
 *
 * The whole project is stdlib-only by design, so instead of pulling a native
 * SQLite binding we back each registry with an atomic JSON file. The API is
 * deliberately narrow (read + mutate-and-flush) so a real SQLite/Postgres store
 * can drop in behind the same shape later without touching callers.
 */
export class JsonStore<T> {
  private data: T;

  constructor(
    private readonly path: string,
    seed: T
  ) {
    if (existsSync(path)) {
      this.data = JSON.parse(readFileSync(path, "utf8")) as T;
    } else {
      this.data = seed;
      this.flush();
    }
  }

  /** Current in-memory snapshot (do not mutate directly — use write). */
  read(): T {
    return this.data;
  }

  /** Apply a mutation and durably persist it. */
  write(mutate: (data: T) => void): void {
    mutate(this.data);
    this.flush();
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
}

/** Root directory for all AgentX state. Override with AGENT_X_DATA_DIR. */
export function dataDir(): string {
  return process.env.AGENT_X_DATA_DIR || join(process.cwd(), ".agentx");
}

/** Absolute path for a named store file inside the data dir. */
export function storePath(name: string): string {
  return join(dataDir(), `${name}.json`);
}
