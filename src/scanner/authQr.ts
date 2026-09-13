export type AuthQrFormat = 'otpauth' | 'otpauth-migration' | 'fido-hybrid';

export type AuthQrRecognition = {
  format: AuthQrFormat;
  /** Compact label with no secret material. */
  summary: string;
  label: string | null;
  issuer: string | null;
};

/**
 * Disposable synthetic fixtures for tests and the spike record.
 * Not live credentials. JBSWY3DPEHPK3PXP is the Key URI Format example.
 */
export const AUTH_QR_FIXTURES = {
  otpauthTotp:
    'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
  otpauthHotp:
    'otpauth://hotp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&counter=1',
  otpauthSecret: 'JBSWY3DPEHPK3PXP',
  otpMigration: 'otpauth-migration://offline?data=ZGlzcG9zYWJsZS1maXh0dXJl',
  otpMigrationData: 'ZGlzcG9zYWJsZS1maXh0dXJl',
  fidoHybrid: 'FIDO:/000111222333444555666777888999',
  fidoDigits: '000111222333444555666777888999',
} as const;

const CONTROL_RE = /[\x00-\x1F\x7F]/;
const FIDO_HYBRID_RE = /^FIDO:\/[0-9]{10,}$/i;

function hasControls(value: string): boolean {
  return CONTROL_RE.test(value);
}

function otpAccountLabel(pathLabel: string): string | null {
  const trimmed = pathLabel.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.includes(':')) {
    const [, after] = trimmed.split(/:(.+)/);
    return after && after.length > 0 ? after : trimmed;
  }
  return trimmed;
}

function recognizeOtpAuth(raw: string): AuthQrRecognition | null {
  if (!/^otpauth:\/\//i.test(raw) || hasControls(raw)) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol.toLowerCase() !== 'otpauth:') {
      return null;
    }
    const type = url.host.toLowerCase();
    if (type !== 'totp' && type !== 'hotp') {
      return null;
    }
    const secret = url.searchParams.get('secret');
    if (secret == null || secret.trim().length === 0) {
      return null;
    }
    const normalizedSecret = secret.trim().replace(/\s+/g, '');
    if (!/^[A-Z2-7]+=*$/.test(normalizedSecret.toUpperCase())) {
      return null;
    }
    const issuerParam = url.searchParams.get('issuer');
    const issuer =
      issuerParam && issuerParam.trim().length > 0 ? issuerParam.trim() : null;
    const pathLabel = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const label = otpAccountLabel(pathLabel);
    return {
      format: 'otpauth',
      summary: issuer ? `Authentication code (${issuer})` : 'Authentication code',
      label,
      issuer,
    };
  } catch {
    return null;
  }
}

function recognizeOtpMigration(raw: string): AuthQrRecognition | null {
  if (!/^otpauth-migration:/i.test(raw) || hasControls(raw)) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol.toLowerCase() !== 'otpauth-migration:') {
      return null;
    }
    if (url.host.toLowerCase() !== 'offline') {
      return null;
    }
    const data = url.searchParams.get('data');
    if (data == null || data.trim().length === 0) {
      return null;
    }
    return {
      format: 'otpauth-migration',
      summary: 'Authenticator export',
      label: null,
      issuer: null,
    };
  } catch {
    return null;
  }
}

function recognizeFidoHybrid(raw: string): AuthQrRecognition | null {
  const trimmed = raw.trim();
  if (!FIDO_HYBRID_RE.test(trimmed) || hasControls(trimmed)) {
    return null;
  }
  return {
    format: 'fido-hybrid',
    summary: 'Passkey sign-in',
    label: null,
    issuer: null,
  };
}

/**
 * Recognition only. Does not invoke a system or app handoff and does not
 * decode CBOR or protobuf secret material.
 */
export function recognizeAuthQr(raw: string): AuthQrRecognition | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return (
    recognizeOtpAuth(trimmed) ??
    recognizeOtpMigration(trimmed) ??
    recognizeFidoHybrid(trimmed)
  );
}
