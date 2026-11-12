/**
 * SIWE-style (EIP-4361 text) sign-in message, exactly as specified in docs/API.md:
 *
 * Mosaic Vault wants you to sign in with your Mezo account:
 * {address}
 *
 * Sign in to Mosaic Vault. No transaction, no gas.
 *
 * URI: {origin}
 * Version: 1
 * Chain ID: 31611
 * Nonce: {nonce}
 * Issued At: {iso}
 * Expiration Time: {iso}
 */

export const SIGN_IN_PREAMBLE = "Mosaic Vault wants you to sign in with your Mezo account:";
export const SIGN_IN_STATEMENT = "Sign in to Mosaic Vault. No transaction, no gas.";
export const SIGN_IN_VERSION = "1";

export interface SignInMessageFields {
  address: string;
  origin: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export function buildSignInMessage(f: SignInMessageFields): string {
  return [
    SIGN_IN_PREAMBLE,
    f.address,
    "",
    SIGN_IN_STATEMENT,
    "",
    `URI: ${f.origin}`,
    `Version: ${SIGN_IN_VERSION}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join("\n");
}

const LINE_RE: Record<keyof Omit<SignInMessageFields, "address">, RegExp> = {
  origin: /^URI: (.+)$/,
  chainId: /^Chain ID: (\d+)$/,
  nonce: /^Nonce: ([0-9a-fA-F]+)$/,
  issuedAt: /^Issued At: (.+)$/,
  expirationTime: /^Expiration Time: (.+)$/,
};

/** Strict parser: returns null unless the message has exactly the documented shape. */
export function parseSignInMessage(message: string): SignInMessageFields | null {
  if (typeof message !== "string" || message.length > 2_000) return null;
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  if (lines.length !== 11) return null;
  if (lines[0] !== SIGN_IN_PREAMBLE) return null;
  const address = lines[1];
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  if (lines[2] !== "" || lines[3] !== SIGN_IN_STATEMENT || lines[4] !== "") return null;
  const origin = lines[5].match(LINE_RE.origin)?.[1];
  const version = lines[6].match(/^Version: (\d+)$/)?.[1];
  const chainId = lines[7].match(LINE_RE.chainId)?.[1];
  const nonce = lines[8].match(LINE_RE.nonce)?.[1];
  const issuedAt = lines[9].match(LINE_RE.issuedAt)?.[1];
  const expirationTime = lines[10].match(LINE_RE.expirationTime)?.[1];
  if (!origin || version !== SIGN_IN_VERSION || !chainId || !nonce || !issuedAt || !expirationTime) return null;
  if (Number.isNaN(Date.parse(issuedAt)) || Number.isNaN(Date.parse(expirationTime))) return null;
  return { address, origin, chainId: Number(chainId), nonce, issuedAt, expirationTime };
}
