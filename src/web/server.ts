import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { LedgerImpl } from "../ledger/index.js";
import { MarketplaceImpl } from "../marketplace/index.js";
import { X402Checkout } from "./x402.js";

/**
 * Web server for AgentX: a landing page plus a small JSON API over the live
 * X402 ledger. Credits are bought with **real USDC on Base over the x402
 * protocol** — no cards, no Stripe. Settlement is delegated to an x402
 * facilitator; the server holds no private key (see ./x402.ts).
 *
 *   GET  /                       landing page
 *   GET  /api/packs              credit packs on sale (USD + USDC)
 *   GET  /api/x402/config        network, payTo, facilitator in use
 *   GET  /api/balance?account=   X402 balance for an account
 *   GET  /api/skills             marketplace skills
 *   GET  /api/settlements        recent on-chain USDC settlements
 *   *    /api/x402/buy/:packId   x402 flow: 402 challenge → pay USDC → mint
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/web → project root → public
const PUBLIC_DIR = join(__dirname, "..", "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  // Prevent path traversal: normalise and keep inside PUBLIC_DIR.
  const abs = normalize(join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  const ext = abs.slice(abs.lastIndexOf("."));
  try {
    const data = await readFile(abs);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>404 — not found</h1><p><a href=\"/\">Back to AgentX</a></p>");
  }
}

export interface ServeOptions {
  port?: number;
  host?: string;
}

export function createApp() {
  const ledger = new LedgerImpl();
  const marketplace = new MarketplaceImpl(ledger);
  const x402 = new X402Checkout(ledger);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    const method = (req.method || "GET").toUpperCase();

    try {
      if (path === "/api/health") {
        const cfg = x402.config();
        return json(res, 200, {
          ok: true,
          service: "agent-x-cc",
          rail: "x402-usdc",
          network: cfg.network,
        });
      }

      if (path === "/api/packs" && method === "GET") {
        const packs = x402.packs().map((p) => ({
          ...p,
          priceUsd: `$${(p.priceUsdCents / 100).toFixed(2)}`,
        }));
        return json(res, 200, { packs });
      }

      if (path === "/api/x402/config" && method === "GET") {
        const cfg = x402.config();
        return json(res, 200, {
          network: cfg.network,
          payTo: cfg.payTo || null,
          facilitator: cfg.facilitatorUrl,
          configured: Boolean(cfg.payTo),
        });
      }

      if (path === "/api/skills" && method === "GET") {
        const skills = await marketplace.list();
        return json(res, 200, { count: skills.length, skills });
      }

      if (path === "/api/settlements" && method === "GET") {
        return json(res, 200, { settlements: x402.settlements() });
      }

      if (path === "/api/balance" && method === "GET") {
        const account = (url.searchParams.get("account") || "").trim();
        if (!account) return json(res, 400, { error: "account query param required" });
        return json(res, 200, { account, balance: await ledger.balance(account) });
      }

      // x402 flow: GET (or POST) /api/x402/buy/:packId  — 402 challenge → pay → mint.
      const buyMatch = path.match(/^\/api\/x402\/buy\/([A-Za-z0-9_-]+)$/);
      if (buyMatch) {
        const packId = buyMatch[1];
        const account = (url.searchParams.get("account") || "").trim();
        const host = req.headers.host || "localhost";
        const resource = `http://${host}${path}`;
        return x402.handle(req, res, packId, account, resource);
      }

      if (path.startsWith("/api/")) {
        return json(res, 404, { error: "no such endpoint" });
      }

      // Static assets / landing page.
      return await serveStatic(res, path);
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  };
}

export function startServer(opts: ServeOptions = {}): void {
  const port = opts.port ?? (Number(process.env.PORT) || 3000);
  const host = opts.host ?? process.env.HOST ?? "0.0.0.0";
  const server = createServer(createApp());
  server.listen(port, host, () => {
    console.log(`AgentX web + x402 USDC payments live → http://${host}:${port}`);
    console.log(`Landing page: http://localhost:${port}/`);
    console.log(`Rail: USDC on Base over x402 · facilitator settles on-chain, server holds no key`);
  });
}
