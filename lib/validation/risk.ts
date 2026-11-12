import { z } from "zod";
import { addressSchema, percentToBps } from "./amount";

const percentField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => percentToBps(v) !== null, `${label} must be a percentage between 0 and 100 with up to 2 decimals.`);

const decimalField = z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a positive number.");

/** Shared parameter block for register + update. Cross-field rules mirror CollateralRegistry.InvalidParameters(). */
export const riskParamsSchema = z
  .object({
    maxLtv: percentField("Max LTV"),
    liquidationThreshold: percentField("Liquidation threshold"),
    liquidationPenalty: percentField("Liquidation penalty"),
    borrowCap: decimalField,
    maxExposure: decimalField,
    minDeposit: decimalField,
  })
  .superRefine((v, ctx) => {
    const ltv = percentToBps(v.maxLtv) ?? 0;
    const liq = percentToBps(v.liquidationThreshold) ?? 0;
    const pen = percentToBps(v.liquidationPenalty) ?? 0;
    if (ltv <= 0) ctx.addIssue({ code: "custom", path: ["maxLtv"], message: "Max LTV must be above 0%." });
    if (ltv >= liq) ctx.addIssue({ code: "custom", path: ["maxLtv"], message: "Max LTV must be below the liquidation threshold." });
    if (liq > 9_500) ctx.addIssue({ code: "custom", path: ["liquidationThreshold"], message: "Liquidation threshold can be at most 95%." });
    if (pen > 3_000) ctx.addIssue({ code: "custom", path: ["liquidationPenalty"], message: "Liquidation penalty can be at most 30%." });
  });

export const registerAssetSchema = z.object({
  token: addressSchema,
  oracle: addressSchema,
  kind: z.enum(["0", "1"]),
  params: riskParamsSchema,
});

export const setOracleSchema = z.object({ token: addressSchema, oracle: addressSchema });

export const testPriceSchema = z.object({
  asset: addressSchema,
  price: decimalField,
});

export const liquidateSchema = z.object({
  user: addressSchema,
  asset: addressSchema,
  repayAmount: decimalField,
});

export type RiskParamsInput = z.infer<typeof riskParamsSchema>;
export type RegisterAssetInput = z.infer<typeof registerAssetSchema>;
