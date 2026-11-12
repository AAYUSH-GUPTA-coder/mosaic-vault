import { describe, expect, it } from "vitest";
import { createSessionToken, getSession, requireSession, SESSION_TTL_SECONDS, verifySessionToken } from "@/lib/auth/session";
import { ApiError } from "@/lib/auth/errors";

const ADDRESS = "0xAbCdEf0000000000000000000000000000000001";

describe("session cookie (HS256 JWT)", () => {
  it("encodes and decodes a session with a lowercase subject", async () => {
    const now = 1_800_000_000;
    const token = await createSessionToken(ADDRESS, now);
    expect(token.split(".")).toHaveLength(3);
    const session = await verifySessionToken(token);
    expect(session).toEqual({ address: ADDRESS.toLowerCase(), issuedAt: now, expiresAt: now + SESSION_TTL_SECONDS });
  });

  it("rejects a tampered token and a token signed with another secret", async () => {
    const token = await createSessionToken(ADDRESS);
    const [h, p, s] = token.split(".");
    expect(await verifySessionToken(`${h}.${p}.${s.slice(0, -2)}xx`)).toBeNull();
    process.env.SESSION_SECRET = "a-completely-different-secret-that-is-32-chars-plus";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - SESSION_TTL_SECONDS - 10;
    const token = await createSessionToken(ADDRESS, past);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("reads the mv_session cookie from a request", async () => {
    const token = await createSessionToken(ADDRESS);
    const req = new Request("http://localhost/api/auth/me", { headers: { cookie: `foo=bar; mv_session=${token}; x=y` } });
    expect((await getSession(req))?.address).toBe(ADDRESS.toLowerCase());
    expect((await requireSession(req)).address).toBe(ADDRESS.toLowerCase());
    await expect(requireSession(new Request("http://localhost/api/auth/me"))).rejects.toBeInstanceOf(ApiError);
  });
});
