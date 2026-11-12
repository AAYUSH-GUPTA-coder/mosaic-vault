import { isAddress } from "viem";
import { z } from "zod";

/** EVM address, validated with viem and lowercased. */
export const addressSchema = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), { message: "must be a valid 0x address" })
  .transform((v) => v.toLowerCase());

export const limitSchema = (def: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(def);

export const nonceBodySchema = z.object({ address: addressSchema });

export const verifyBodySchema = z.object({
  address: addressSchema,
  message: z.string().min(1).max(2_000),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, "must be a hex signature")
    .max(4_000),
});

export const positionsQuerySchema = z.object({ wallet: addressSchema });

export const eventsQuerySchema = z.object({
  wallet: addressSchema.optional(),
  asset: addressSchema.optional(),
  limit: limitSchema(50, 200),
  cursor: z.string().regex(/^\d+$/).optional(),
});

export const snapshotsQuerySchema = z.object({
  asset: addressSchema,
  limit: limitSchema(100, 1_000),
});

export const auditQuerySchema = z.object({ limit: limitSchema(50, 500) });

export const auditBodySchema = z.object({
  action: z.string().min(1).max(120),
  target: z.string().max(300).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
