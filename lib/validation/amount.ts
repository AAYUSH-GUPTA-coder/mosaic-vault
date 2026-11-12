import { parseUnits } from "viem";
import { z } from "zod";

export interface ParsedAmount {
  ok: true;
  value: bigint;
}
export interface AmountError {
  ok: false;
  message: string;
}

/** Decimal string -> bigint via parseUnits; never a float. */
export function parseAmount(input: string, decimals: number): ParsedAmount | AmountError {
  const s = input.trim().replace(/,/g, "");
  if (!s) return { ok: false, message: "Enter an amount." };
  if (!/^\d*\.?\d*$/.test(s) || s === ".") return { ok: false, message: "Use digits and one decimal point only." };
  const frac = s.split(".")[1] ?? "";
  if (frac.length > decimals) return { ok: false, message: `This asset supports up to ${decimals} decimal places.` };
  let value: bigint;
  try {
    value = parseUnits(s, decimals);
  } catch {
    return { ok: false, message: "That amount is not valid." };
  }
  if (value <= 0n) return { ok: false, message: "Enter an amount greater than zero." };
  return { ok: true, value };
}

export const addressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a valid 0x address (40 hex characters).");

/** A decimal amount string validated for a given number of decimals. */
export const amountStringSchema = (decimals: number) =>
  z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const r = parseAmount(v, decimals);
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.message });
    });

/** Percent string like "60" or "60.5" -> bps integer (no floats: string arithmetic). */
export function percentToBps(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const bps = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return bps > 10_000 ? null : bps;
}

export function bpsToPercentString(bps: number): string {
  const whole = Math.floor(bps / 100);
  const rem = bps % 100;
  return rem === 0 ? String(whole) : `${whole}.${String(rem).padStart(2, "0").replace(/0$/, "")}`;
}
