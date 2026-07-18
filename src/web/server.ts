import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { LedgerImpl } from "../ledger/index.js";
import { MarketplaceImpl } from "../marketplace/index.js";
import { CheckoutService } from "./checkout.js";

/**
 * Zero-dependency web server for AgentX: a working landing page plus a small
 * JSON API over the live X402 ledger and the test-mode payment gateway.
 *
 *   GET  /                     landing page
 *   GET  /api/packs            credit packs on sale
 *   GET  /api/balance?account= X402 balance for an account
 *   GET  /api/skills           marketplace skills
 *   GET  /api/orders           recent test orders
 *   POST /api/checkout         { account, packId, card } → mint credits on success
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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
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
  const checkout = new CheckoutService(ledger);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    const method = (req.method || "GET").toUpperCase();

    try {
      if (path === "/api/health") {
        return json(res, 200, { ok: true, service: "agent-x-cc", mode: "test" });
      }

      if (path === "/api/packs" && method === "GET") {
        return json(res, 200, { packs: checkout.packs() });
      }

      if (path === "/api/skills" && method === "GET") {
        const skills = await marketplace.list();
        return json(res, 200, { count: skills.length, skills });
      }

      if (path === "/api/orders" && method === "GET") {
        return json(res, 200, { orders: checkout.orders() });
      }

      if (path === "/api/balance" && method === "GET") {
        const account = (url.searchParams.get("account") || "").trim();
        if (!account) return json(res, 400, { error: "account query param required" });
        return json(res, 200, { account, balance: await ledger.balance(account) });
      }

      if (path === "/api/checkout" && method === "POST") {
        let parsed: any;
        try {
          parsed = JSON.parse((await readBody(req)) || "{}");
        } catch {
          return json(res, 400, { error: "invalid JSON body" });
        }
        const result = await checkout.checkout({
          account: parsed.account,
          packId: parsed.packId,
          card: parsed.card,
          createdAt: new Date().toISOString(),
        });
        if (result.ok) {
          return json(res, 200, { ok: true, order: result.order, balance: result.balance });
        }
        const status = result.code === "card_declined" ? 402 : 400;
        return json(res, status, { ok: false, code: result.code, error: result.message });
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
    console.log(`AgentX web + test payments live → http://${host}:${port}`);
    console.log(`Landing page: http://localhost:${port}/`);
    console.log(`Test card (approved): 4242 4242 4242 4242 · (declined): 4000 0000 0000 0002`);
  });
}
