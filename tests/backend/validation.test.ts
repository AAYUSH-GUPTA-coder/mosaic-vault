import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as positions } from "@/app/api/positions/route";
import { GET as events } from "@/app/api/events/route";
import { GET as snapshots } from "@/app/api/snapshots/route";
import { GET as assets } from "@/app/api/assets/route";
import { POST as nonce } from "@/app/api/auth/nonce/route";
import { POST as indexerRun } from "@/app/api/indexer/run/route";
import { GET as auditGet } from "@/app/api/admin/audit/route";
import { resetRateLimits } from "@/app/api/_lib/rate-limit";

const get = (url: string) => new NextRequest(`http://localhost:3000${url}`);

describe("input validation and unconfigured fallbacks", () => {
  beforeEach(() => resetRateLimits());

  it("GET /api/positions with a bad wallet -> 400", async () => {
    const res = await positions(get("/api/positions?wallet=0x123"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("BAD_REQUEST");
    expect(json.error.message).toContain("wallet");
  });

  it("GET /api/positions without a wallet -> 400; valid -> unconfigured empty", async () => {
    expect((await positions(get("/api/positions"))).status).toBe(400);
    const res = await positions(get("/api/positions?wallet=0x1111111111111111111111111111111111111111"));
    expect(await res.json()).toEqual({ ok: true, data: [], source: "unconfigured" });
  });

  it("GET /api/events validates asset/limit and returns nextCursor", async () => {
    expect((await events(get("/api/events?asset=nope"))).status).toBe(400);
    expect((await events(get("/api/events?limit=0"))).status).toBe(400);
    expect((await events(get("/api/events?cursor=abc"))).status).toBe(400);
    const res = await events(get("/api/events?wallet=0x1111111111111111111111111111111111111111&limit=10"));
    expect(await res.json()).toEqual({ ok: true, data: [], source: "unconfigured", nextCursor: null });
  });

  it("GET /api/snapshots requires a valid asset", async () => {
    expect((await snapshots(get("/api/snapshots"))).status).toBe(400);
    const res = await snapshots(get("/api/snapshots?asset=0x7b7C000000000000000000000000000000000000"));
    expect(await res.json()).toEqual({ ok: true, data: [], source: "unconfigured" });
  });

  it("GET /api/assets falls back to static rows when unconfigured", async () => {
    process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS = "0x7b7C000000000000000000000000000000000000";
    const res = await assets();
    const json = await res.json();
    expect(json.source).toBe("static");
    expect(json.data.some((r: { symbol: string }) => r.symbol === "BTC")).toBe(true);
    expect(json.data.every((r: { token_address: string }) => r.token_address === r.token_address.toLowerCase())).toBe(true);
  });

  it("POST /api/auth/nonce with a bad address -> 400, with bad JSON -> 400", async () => {
    const bad = await nonce(new NextRequest("http://localhost:3000/api/auth/nonce", { method: "POST", body: JSON.stringify({ address: "0xZZ" }) }));
    expect(bad.status).toBe(400);
    const notJson = await nonce(new NextRequest("http://localhost:3000/api/auth/nonce", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error.code).toBe("BAD_JSON");
  });

  it("POST /api/indexer/run without a secret -> 401; with either secret -> ok (unconfigured)", async () => {
    process.env.INDEXER_SECRET = "indexer-secret";
    process.env.CRON_SECRET = "cron-secret";
    const noAuth = await indexerRun(new NextRequest("http://localhost:3000/api/indexer/run", { method: "POST" }));
    expect(noAuth.status).toBe(401);
    const viaHeader = await indexerRun(new NextRequest("http://localhost:3000/api/indexer/run", { method: "POST", headers: { "x-indexer-secret": "indexer-secret" } }));
    expect(await viaHeader.json()).toMatchObject({ ok: true, source: "unconfigured", processed: 0 });
    const viaCron = await indexerRun(new NextRequest("http://localhost:3000/api/indexer/run", { method: "POST", headers: { authorization: "Bearer cron-secret" } }));
    expect(viaCron.status).toBe(200);
    const wrong = await indexerRun(new NextRequest("http://localhost:3000/api/indexer/run", { method: "POST", headers: { authorization: "Bearer nope" } }));
    expect(wrong.status).toBe(401);
  });

  it("GET /api/admin/audit without a session -> 401", async () => {
    const res = await auditGet(get("/api/admin/audit"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });
});
