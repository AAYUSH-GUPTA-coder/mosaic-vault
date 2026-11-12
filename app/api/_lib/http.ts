import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/auth/errors";
import type { ApiErr, ApiOk, ApiSource } from "@/types/api";

export function ok<T>(data: T, source?: ApiSource, extra?: { nextCursor?: string | null; status?: number }): NextResponse<ApiOk<T>> {
  const body: ApiOk<T> = { ok: true, data };
  if (source) body.source = source;
  if (extra && "nextCursor" in extra) body.nextCursor = extra.nextCursor ?? null;
  return NextResponse.json(body, { status: extra?.status ?? 200 });
}

export function fail(status: number, code: string, message: string): NextResponse<ApiErr> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/** Wraps a handler; maps ApiError / ZodError / unknown errors to the uniform envelope. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      unstable_rethrow(err); // let Next.js prerender/dynamic signals propagate
      if (err instanceof ApiError) return fail(err.status, err.code, err.message);
      if (err instanceof ZodError) return fail(400, "BAD_REQUEST", formatZod(err));
      console.error("[api] unhandled error", err);
      return fail(500, "INTERNAL", "Internal server error");
    }
  };
}

export function formatZod(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "BAD_JSON", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(400, "BAD_REQUEST", formatZod(result.error));
  return result.data;
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  const result = schema.safeParse(obj);
  if (!result.success) throw new ApiError(400, "BAD_REQUEST", formatZod(result.error));
  return result.data;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
