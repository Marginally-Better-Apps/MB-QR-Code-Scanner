import {
  PAYLOAD_PARSER_VERSION,
  type ParsedQRPayload,
} from '@/scanner/payloadParser';

export type StoredHistoryEvent = {
  /** UUID v4 identifying this stored scan event. */
  id: string;
  /** ISO 8601 timestamp of acceptance (not first sighting). */
  acceptedAt: string;
  /** Content kind for safe events, `wifi` for redacted Wi-Fi, `redacted` for secrets. */
  kind: string;
  /** Safe display summary, or null when no safe summary exists (secrets). */
  summary: string | null;
  /** Original payload only when the policy allows it, otherwise null. */
  original: string | null;
  /** Parser version that produced the classification. */
  parserVersion: number;
};

export const REDACTED_HISTORY_KIND = 'redacted';
export const WIFI_HISTORY_KIND = 'wifi';
export const WIFI_STORAGE_SUMMARY = 'Wi-Fi network';

/**
 * Secret-enrollment markers. Bare words like "fido" alone do not match; the
 * pattern keeps ordinary prose fully stored while catching enrollment blobs
 * and key material in any payload kind.
 */
const SECRET_ENROLLMENT_RE =
  /\b(passkey|webauthn|fido2)\b|fido:|private\s*key|BEGIN\s+[A-Z0-9 ]*PRIVATE\s+KEY/i;

export function looksLikeSecretEnrollment(raw: string): boolean {
  return SECRET_ENROLLMENT_RE.test(raw);
}

function randomUuidFallback(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

export function randomHistoryId(): string {
  try {
    const randomUUID = (globalThis.crypto as Crypto | undefined)?.randomUUID;
    if (typeof randomUUID === 'function') {
      return randomUUID.call(globalThis.crypto);
    }
  } catch {
    // Fall through to the manual v4 generator.
  }
  return randomUuidFallback();
}

/**
 * Central sensitivity-to-storage policy (HIS-01).
 *
 * - `standard` payloads persist the safe summary plus the allowed original.
 * - Wi-Fi (`redacted`) persists a generic summary only: password and SSID
 *   are omitted by default and the original payload is never stored.
 * - OTP / session-only payloads and secret-enrollment text persist at most a
 *   generic redacted kind and the acceptance timestamp: no summary, no
 *   original, and no raw secret anywhere in the row.
 */
export function toStorableHistoryEvent(
  parsed: ParsedQRPayload,
  acceptedAt: Date,
  id: string = randomHistoryId(),
): StoredHistoryEvent {
  const acceptedAtIso = acceptedAt.toISOString();
  const parserVersion = PAYLOAD_PARSER_VERSION;

  if (parsed.sensitivity === 'sessionOnly') {
    return {
      id,
      acceptedAt: acceptedAtIso,
      kind: REDACTED_HISTORY_KIND,
      summary: null,
      original: null,
      parserVersion,
    };
  }

  if (parsed.sensitivity === 'redacted') {
    return {
      id,
      acceptedAt: acceptedAtIso,
      kind: WIFI_HISTORY_KIND,
      summary: WIFI_STORAGE_SUMMARY,
      original: null,
      parserVersion,
    };
  }

  // Unstructured secret blobs (text fallback) are always redacted, and any
  // structured payload carrying enrollment markers (e.g. a passkey custom
  // scheme) is redacted too: raw secret material must never reach the store.
  if (looksLikeSecretEnrollment(parsed.originalPayload)) {
    return {
      id,
      acceptedAt: acceptedAtIso,
      kind: REDACTED_HISTORY_KIND,
      summary: null,
      original: null,
      parserVersion,
    };
  }

  return {
    id,
    acceptedAt: acceptedAtIso,
    kind: parsed.content.kind,
    summary: parsed.displaySummary,
    original: parsed.originalPayload,
    parserVersion,
  };
}
