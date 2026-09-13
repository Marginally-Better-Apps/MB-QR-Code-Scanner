import { looksLikeSecretEnrollment } from '@/history/historyPolicy';
import type { ParsedQRPayload } from '@/scanner/payloadParser';
import { sanitizeVisibleText } from '@/scanner/webTextPresentation';

const LOG_MAX_LENGTH = 120;

const SECRET_QUERY_RE = /([?&](?:secret|data)=)([^&\s]+)/gi;
const WIFI_PASSWORD_RE = /;P:((?:\\.|[^;])*);/g;
const PRIVATE_KEY_RE =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi;

/**
 * Scrub a raw string for log/diagnostic output (QLT-05). Secret-shaped
 * material is masked, then the shared visible-text sanitizer neutralizes
 * controls/invisible characters and bounds the length. Prefer
 * `diagnosticSummaryForPayload` for structured diagnostics; use this only
 * when echoing user content is unavoidable.
 */
export function redactForLog(value: string, maxLength = LOG_MAX_LENGTH): string {
  const scrubbed = value
    .replace(SECRET_QUERY_RE, '$1[redacted]')
    .replace(WIFI_PASSWORD_RE, ';P:[redacted];')
    .replace(PRIVATE_KEY_RE, '[redacted-private-key]');
  return sanitizeVisibleText(scrubbed, maxLength);
}

export type PayloadDiagnosticSummary = {
  kind: string;
  sensitivity: ParsedQRPayload['sensitivity'];
  parserVersion: number;
  actionCount: number;
};

/**
 * Metadata-only diagnostic record. Carries no raw payload, summary, or
 * secret: safe for logs, analytics events, and crash breadcrumbs.
 */
export function diagnosticSummaryForPayload(
  parsed: ParsedQRPayload,
): PayloadDiagnosticSummary {
  return {
    kind: parsed.content.kind,
    sensitivity: parsed.sensitivity,
    parserVersion: parsed.parserVersion,
    actionCount: parsed.actions.length,
  };
}

/**
 * Single choke point for accessibility output (QLT-05). Announcements and
 * accessibility labels for scan results must flow through here so raw
 * session-only payloads, Wi-Fi passwords, and key material can never reach
 * VoiceOver outside the explicit display policy (visible preview text).
 * The parser already keeps passwords out of `displaySummary`; this locks
 * that guarantee behind sanitization, and unstructured secret blobs
 * (e.g. pasted private keys) collapse to the generic `redactedTitle` the
 * caller supplies — the same label history rows use.
 */
export function describeForAccessibility(
  parsed: ParsedQRPayload,
  redactedTitle: string,
): string {
  // Structured session-only results (OTP, passkey) already summarize without
  // secret material by construction; unstructured secret blobs collapse to
  // the generic history label instead of being read aloud.
  if (
    parsed.sensitivity !== 'sessionOnly' &&
    looksLikeSecretEnrollment(parsed.originalPayload)
  ) {
    return redactedTitle;
  }
  return sanitizeVisibleText(parsed.displaySummary);
}
