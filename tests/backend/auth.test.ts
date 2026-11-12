import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as nonceRoute } from "@/app/api/auth/nonce/route";
import { POST as verifyRoute } from "@/app/api/auth/verify/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { resetRateLimits } from "@/app/api/_lib/rate-limit";
import { _resetNonceStore, NONCE_TTL_MS } from "@/lib/auth/nonce";
import { buildSignInMessage, parseSignInMessage } from "@/lib/auth/message";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

async function issue(address: string) {
  const res = await nonceRoute(post("/api/auth/nonce", { address }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.source).toBe("unconfigured");
  return json.data as { nonce: string; message: string; expiresAt: string };
}

describe("wallet sign-in (nonce + verify)", () => {
  const account = privateKeyToAccount(generatePrivateKey());

  beforeEach(() => {
    resetRateLimits();
    _resetNonceStore();
  });
  afterEach(() => vi.useRealTimers());

  it("issues a message in the documented format", async () => {
    const { nonce, message, expiresAt } = await issue(account.address);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    const parsed = parseSignInMessage(message);
    expect(parsed).not.toBeNull();
    expect(parsed!.chainId).toBe(31611);
    expect(parsed!.nonce).toBe(nonce);
    expect(parsed!.origin).toBe("http://localhost:3000");
    expect(parsed!.address.toLowerCase()).toBe(account.address.toLowerCase());
    expect(parsed!.expirationTime).toBe(expiresAt);
    expect(message.startsWith("Mosaic Vault wants you to sign in with your Mezo account:\n")).toBe(true);
    expect(message).toContain("\n\nSign in to Mosaic Vault. No transaction, no gas.\n\nURI: ");
    // round-trip
    expect(buildSignInMessage(parsed!)).toBe(message);
  });

  it("happy path: real signature -> session cookie -> /me", async () => {
    const { message } = await issue(account.address);
    const signature = await account.signMessage({ message });
    const res = await verifyRoute(post("/api/auth/verify", { address: account.address, message, signature }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, data: { address: account.address.toLowerCase() } });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^mv_session=/);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const token = setCookie.split(";")[0].split("=")[1];
    const me = await meRoute(new NextRequest("http://localhost:3000/api/auth/me", { headers: { cookie: `mv_session=${token}` } }));
    expect(me.status).toBe(200);
    expect((await me.json()).data.address).toBe(account.address.toLowerCase());

    const out = await logoutRoute();
    expect(out.headers.get("set-cookie")).toMatch(/mv_session=;.*Max-Age=0/i);
  });

  it("rejects a signature from the wrong signer", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const { message } = await issue(account.address);
    const signature = await other.signMessage({ message });
    const res = await verifyRoute(post("/api/auth/verify", { address: account.address, message, signature }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("BAD_SIGNATURE");
  });

  it("rejects an expired nonce", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T00:00:00Z"));
    const { message } = await issue(account.address);
    const signature = await account.signMessage({ message });
    vi.setSystemTime(new Date(Date.now() + NONCE_TTL_MS + 1_000));
    const res = await verifyRoute(post("/api/auth/verify", { address: account.address, message, signature }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("NONCE_EXPIRED");
  });

  it("rejects a replayed nonce", async () => {
    const { message } = await issue(account.address);
    const signature = await account.signMessage({ message });
    const first = await verifyRoute(post("/api/auth/verify", { address: account.address, message, signature }));
    expect(first.status).toBe(200);
    const second = await verifyRoute(post("/api/auth/verify", { address: account.address, message, signature }));
    expect(second.status).toBe(401);
    expect((await second.json()).error.code).toBe("NONCE_USED");
  });

  it("rejects a message with the wrong chain id", async () => {
    const { message } = await issue(account.address);
    const tampered = message.replace("Chain ID: 31611", "Chain ID: 1");
    const signature = await account.signMessage({ message: tampered });
    const res = await verifyRoute(post("/api/auth/verify", { address: account.address, message: tampered, signature }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_CHAIN_ID");
  });

  it("rejects an unknown nonce", async () => {
    const { message } = await issue(account.address);
    _resetNonceStore();
    const signature = await account.signMessage({ message });
    const res = await verifyRoute(post("/api/auth/verify", { address: account.address, message, signature }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("NONCE_UNKNOWN");
  });

  it("rate-limits the nonce route per IP (20/min)", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await nonceRoute(post("/api/auth/nonce", { address: account.address }, { "x-forwarded-for": "10.0.0.9" }));
      expect(res.status).toBe(200);
    }
    const res = await nonceRoute(post("/api/auth/nonce", { address: account.address }, { "x-forwarded-for": "10.0.0.9" }));
    expect(res.status).toBe(429);
  });
});
