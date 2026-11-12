import { describe, expect, it, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { createManagerChecker, RISK_MANAGER_ROLE } from "@/lib/auth/manager";

const MANAGER = "0x1111111111111111111111111111111111111111";
const USER = "0x2222222222222222222222222222222222222222";

describe("manager gate", () => {
  it("RISK_MANAGER_ROLE = keccak256('RISK_MANAGER_ROLE')", () => {
    expect(RISK_MANAGER_ROLE).toBe(keccak256(toHex("RISK_MANAGER_ROLE")));
  });

  it("uses hasRole(RISK_MANAGER_ROLE, address) and caches for 60s", async () => {
    const hasRole = vi.fn(async (_role: string, account: string) => account === MANAGER);
    const checker = createManagerChecker({ hasRole, registryConfigured: () => true });
    const t0 = 1_000_000;
    expect(await checker.isManager(MANAGER, t0)).toBe(true);
    expect(await checker.isManager(USER, t0)).toBe(false);
    expect(hasRole).toHaveBeenCalledWith(RISK_MANAGER_ROLE, MANAGER);
    expect(hasRole).toHaveBeenCalledTimes(2);
    // cached
    expect(await checker.isManager(MANAGER.toUpperCase().replace("0X", "0x"), t0 + 30_000)).toBe(true);
    expect(hasRole).toHaveBeenCalledTimes(2);
    // cache expired
    expect(await checker.isManager(MANAGER, t0 + 61_000)).toBe(true);
    expect(hasRole).toHaveBeenCalledTimes(3);
  });

  it("returns false when the registry address is not configured or the read fails", async () => {
    const hasRole = vi.fn(async () => true);
    const unconfigured = createManagerChecker({ hasRole, registryConfigured: () => false });
    expect(await unconfigured.isManager(MANAGER)).toBe(false);
    expect(hasRole).not.toHaveBeenCalled();
    const failing = createManagerChecker({ hasRole: async () => { throw new Error("rpc down"); }, registryConfigured: () => true });
    expect(await failing.isManager(MANAGER)).toBe(false);
    expect(await failing.isManager("not-an-address")).toBe(false);
  });
});
