import { beforeEach, vi } from "vitest";

// Route handlers call next/server connection() to opt out of prerendering; unit tests run outside a request scope.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// Supabase deliberately unconfigured: auth uses the in-memory nonce store, reads return "unconfigured".
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_CHAIN_ID = "31611";
  process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-chars-long";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});
