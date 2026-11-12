import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("service-role client isolation", () => {
  it('lib/database/server.ts starts with import "server-only"', () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/database/server.ts"), "utf8");
    const firstStatement = src.split("\n").find((l) => l.trim().length > 0 && !l.trim().startsWith("//"));
    expect(firstStatement?.trim()).toBe('import "server-only";');
  });

  it("lib/database/public.ts never reads the service-role key", () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/database/public.ts"), "utf8");
    expect(src).not.toContain("serviceRoleKey");
    expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
