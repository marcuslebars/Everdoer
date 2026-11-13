/**
 * The owner line's signed call metadata and caller checks (voice/owner-line.ts,
 * docs/owner-line.md). Pure and dependency-free on purpose: the Retell webhook route imports
 * isOwnerLineWebhook from here without pulling in the agent, the facts loader or Twilio.
 */
import crypto from "node:crypto";

export const OWNER_LINE_SOURCE = "owner_line";
/** The token covers one call (≤ the call cap) plus slack; not a replay hours later. */
export const OWNER_LINE_TOKEN_MAX_AGE_MS = 3 * 3_600_000;
/** Twilio's StirVerstat for "the originating carrier vouches for this exact number". */
export const STIR_FULL_ATTESTATION = "TN-Validation-Passed-A";

/** The carrier vouched for the caller's number (full attestation only; not B, C or diverted). PURE. */
export function carrierVerified(stirVerstat: string | null | undefined): boolean {
  return (stirVerstat ?? "").trim() === STIR_FULL_ATTESTATION;
}

export interface OwnerLineClaims {
  organizationId: string;
  companyId: string;
  /** What ties the token to one call: the Twilio CallSid, or Retell's call id on a Retell number. */
  callRef: string;
  /** The caller was verified when the call arrived (carrier attestation, or the pilot override). */
  callerVerified: boolean;
  /** Unix seconds. */
  issuedAt: number;
}

function claimsPayload(c: OwnerLineClaims): string {
  return [OWNER_LINE_SOURCE, c.organizationId, c.companyId, c.callRef, c.callerVerified ? "1" : "0", c.issuedAt].join("|");
}

export function signOwnerLineToken(claims: OwnerLineClaims, secret: string): string {
  return crypto.createHmac("sha256", secret).update(claimsPayload(claims)).digest("base64url");
}

/** The metadata we hand Retell (all strings); it comes back on every function call and webhook. */
export function buildOwnerLineMetadata(claims: OwnerLineClaims, secret: string): Record<string, string> {
  return {
    source: OWNER_LINE_SOURCE,
    organization_id: claims.organizationId,
    company_id: claims.companyId,
    call_ref: claims.callRef,
    caller_verified: claims.callerVerified ? "1" : "0",
    issued_at: String(claims.issuedAt),
    token: signOwnerLineToken(claims, secret),
  };
}

/**
 * Read + verify owner-line metadata. null = not an owner-line call; { valid: false } = it claims
 * to be one but the token doesn't verify or has expired (never trust it); else the claims.
 */
export function readOwnerLineMetadata(metadata: unknown, secret: string | null, nowMs: number = Date.now()): OwnerLineClaims | { valid: false } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  if (m.source !== OWNER_LINE_SOURCE) return null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const organizationId = str(m.organization_id);
  const companyId = str(m.company_id);
  const callRef = str(m.call_ref);
  const issuedAt = Number(str(m.issued_at));
  const token = str(m.token);
  if (!secret || !organizationId || !companyId || !callRef || !token || !Number.isFinite(issuedAt) || issuedAt <= 0) return { valid: false };
  const claims: OwnerLineClaims = { organizationId, companyId, callRef, callerVerified: m.caller_verified === "1", issuedAt };
  const expected = Buffer.from(signOwnerLineToken(claims, secret));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { valid: false };
  if (nowMs - issuedAt * 1000 > OWNER_LINE_TOKEN_MAX_AGE_MS || issuedAt * 1000 - nowMs > 5 * 60_000) return { valid: false };
  return claims;
}

export function isOwnerLineClaims(value: ReturnType<typeof readOwnerLineMetadata>): value is OwnerLineClaims {
  return Boolean(value && !("valid" in value));
}

/** A Retell webhook payload for an owner-line call (the post-call pipeline must skip these). PURE. */
export function isOwnerLineWebhook(payload: unknown): boolean {
  const call = payload && typeof payload === "object" ? (payload as Record<string, unknown>).call : null;
  const metadata = call && typeof call === "object" ? (call as Record<string, unknown>).metadata : null;
  return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).source === OWNER_LINE_SOURCE);
}

/** The six-digit code that unlocks business tools on THIS call (texted to the owner's cell). PURE. */
export function unlockCode(claims: Pick<OwnerLineClaims, "organizationId" | "companyId" | "callRef">, secret: string): string {
  const digest = crypto.createHmac("sha256", secret).update(`owner_line_unlock|${claims.organizationId}|${claims.companyId}|${claims.callRef}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** "four eight two one" / "4821 55" → digits only. PURE. */
export function spokenDigits(raw: unknown): string {
  return typeof raw === "string" || typeof raw === "number" ? String(raw).replace(/\D/g, "") : "";
}
