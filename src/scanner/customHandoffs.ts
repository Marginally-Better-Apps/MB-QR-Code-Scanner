import {
  STRUCTURED_PARSERS,
  type QRContent,
  type ParsedQRPayload,
  type QRSensitivity,
  type StructuredParser,
} from './payloadParser';

const SCHEME_SYNTAX = /^[a-z][a-z0-9+.-]*$/i;

/**
 * Generic payment / value-transfer schemes (ACT-09). These stay as plain
 * app handoffs: the scanner never transacts, never decodes amounts as
 * instructions, and never claims the request was verified.
 */
const PAYMENT_HANDOFF_SCHEMES = new Set([
  'bitcoin',
  'ethereum',
  'litecoin',
  'dogecoin',
  'payto',
  'upi',
  'pix',
  'sepa',
  'venmo',
  'paypal',
  'cashapp',
  'alipay',
  'weixin',
]);

export function isPaymentHandoffScheme(scheme: string): boolean {
  return PAYMENT_HANDOFF_SCHEMES.has(scheme.toLowerCase());
}

export function isPaymentHandoff(parsed: ParsedQRPayload): boolean {
  return (
    parsed.content.kind === 'customScheme' &&
    isPaymentHandoffScheme(parsed.content.scheme)
  );
}

export type CustomHandoffDescription = {
  scheme: string;
  remainder: string;
  appName: string | null;
  isPayment: boolean;
  verificationNote: string | null;
};

/**
 * Presentation helper for custom-scheme handoffs. The scheme always renders;
 * the system-resolved app name renders only when the caller supplies the
 * name the OS exposed (via `getAppNameForURL`). Payment handoffs carry an
 * explicit unverified marker — never a verification claim.
 */
export function describeCustomHandoff(
  parsed: ParsedQRPayload,
  appName: string | null | undefined,
): CustomHandoffDescription {
  if (parsed.content.kind !== 'customScheme') {
    throw new Error('describeCustomHandoff requires a custom-scheme result');
  }
  const isPayment = isPaymentHandoffScheme(parsed.content.scheme);
  return {
    scheme: parsed.content.scheme,
    remainder: parsed.content.remainder,
    appName: appName ?? null,
    isPayment,
    verificationNote: isPayment
      ? 'This payment request is not verified — confirm details in your payment app before paying.'
      : null,
  };
}

export type AdapterFixture = {
  raw: string;
  expectParsed: boolean;
};

export type AdapterRegistration = {
  id: string;
  sensitivity: QRSensitivity;
  parse: (raw: string) => QRContent | null;
  fixtures: AdapterFixture[];
  allowedSchemes?: readonly string[];
};

const MALFORMED_PROBE_INPUTS = ['', ':::', 'acmetest:', '   ', '\x00bad'];

/**
 * Adding a parser requires fixtures, a sensitivity classification, and
 * malformed-input behavior (ACT-09). Throws on any violation so CI fails
 * loudly instead of shipping an unreviewed handoff.
 */
export function validateAdapterRegistration(reg: AdapterRegistration): void {
  if (!reg || typeof reg.id !== 'string' || reg.id.trim().length === 0) {
    throw new Error('Adapter registration requires a non-empty id');
  }
  if (reg.sensitivity !== 'standard' && reg.sensitivity !== 'redacted' && reg.sensitivity !== 'sessionOnly') {
    throw new Error(`Adapter "${reg.id}" requires a sensitivity classification`);
  }
  if (typeof reg.parse !== 'function') {
    throw new Error(`Adapter "${reg.id}" requires a parse function`);
  }
  if (!Array.isArray(reg.fixtures) || reg.fixtures.length === 0) {
    throw new Error(`Adapter "${reg.id}" requires at least one fixture`);
  }
  if (reg.allowedSchemes !== undefined) {
    if (!Array.isArray(reg.allowedSchemes) || reg.allowedSchemes.length === 0) {
      throw new Error(`Adapter "${reg.id}" allowlist must not be empty`);
    }
    for (const scheme of reg.allowedSchemes) {
      if (!SCHEME_SYNTAX.test(scheme)) {
        throw new Error(`Adapter "${reg.id}" has an invalid allowlisted scheme "${scheme}"`);
      }
    }
  }
  for (const raw of MALFORMED_PROBE_INPUTS) {
    let threw = false;
    try {
      reg.parse(raw);
    } catch {
      threw = true;
    }
    if (threw) {
      throw new Error(`Adapter "${reg.id}" must not throw on malformed input`);
    }
  }
  for (const fixture of reg.fixtures) {
    let result: QRContent | null = null;
    try {
      result = reg.parse(fixture.raw);
    } catch {
      throw new Error(`Adapter "${reg.id}" must not throw on fixture input`);
    }
    if (fixture.expectParsed && result == null) {
      throw new Error(`Adapter "${reg.id}" fixture did not parse: ${fixture.raw}`);
    }
  }
}

/**
 * Independently registerable parser behind the central confirmation +
 * sensitivity policy (ACT-09). The adapter only returns content; actions,
 * confirmation gating, and history storage stay central in ActionRouter and
 * historyPolicy, so an adapter cannot bypass shared policy. Inserts before
 * the generic customScheme fallback. Returns an unregister closure for tests.
 */
export function registerCustomParser(reg: AdapterRegistration): () => void {
  validateAdapterRegistration(reg);
  if (STRUCTURED_PARSERS.some((parser) => parser.id === reg.id)) {
    throw new Error(`Adapter id "${reg.id}" is already registered`);
  }
  const entry: StructuredParser = {
    id: reg.id,
    sensitivity: reg.sensitivity,
    parse: reg.parse,
  };
  const fallbackIndex = STRUCTURED_PARSERS.findIndex(
    (parser) => parser.id === 'customScheme',
  );
  if (fallbackIndex < 0) {
    STRUCTURED_PARSERS.push(entry);
  } else {
    STRUCTURED_PARSERS.splice(fallbackIndex, 0, entry);
  }
  return () => {
    const index = STRUCTURED_PARSERS.findIndex((parser) => parser.id === reg.id);
    if (index >= 0) {
      STRUCTURED_PARSERS.splice(index, 1);
    }
  };
}

const CONTROL_OR_SPACE_RE = /[\x00-\x1F\x7F\s]/;

/**
 * Explicit allowlisting factory (ACT-09). The parser claims only its listed
 * schemes; everything else falls through to the generic customScheme
 * fallback. Malformed inputs return null so the text fallback keeps the raw.
 */
export function createAllowlistedSchemeParser(
  id: string,
  allowedSchemes: readonly string[],
  sensitivity: QRSensitivity,
): AdapterRegistration {
  const allowed = allowedSchemes.map((scheme) => scheme.toLowerCase());
  if (allowed.length === 0) {
    throw new Error(`Adapter "${id}" allowlist must not be empty`);
  }
  for (const scheme of allowed) {
    if (!SCHEME_SYNTAX.test(scheme)) {
      throw new Error(`Adapter "${id}" has an invalid allowlisted scheme "${scheme}"`);
    }
  }
  const fixtures: AdapterFixture[] = allowed.map((scheme) => ({
    raw: `${scheme}://pay?amount=10&to=bob`,
    expectParsed: true,
  }));
  return {
    id,
    sensitivity,
    allowedSchemes: allowed,
    fixtures,
    parse: (raw: string): QRContent | null => {
      const trimmed = raw.trim();
      if (trimmed.length === 0 || CONTROL_OR_SPACE_RE.test(trimmed)) {
        return null;
      }
      const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/s.exec(trimmed);
      if (!match) {
        return null;
      }
      const scheme = match[1].toLowerCase();
      const remainder = match[2];
      if (remainder.length === 0) {
        return null;
      }
      if (!allowed.includes(scheme)) {
        return null;
      }
      return { kind: 'customScheme', scheme, remainder };
    },
  };
}

export type CustomHandoffFixture = {
  name: string;
  raw: string;
  scheme: string;
  parserIds: string[];
  description: string;
};

export const SYNTHETIC_HANDOFF_FIXTURE: CustomHandoffFixture = {
  name: 'synthetic-acmetest-handoff',
  raw: 'acmetest://pay?amount=10&to=bob',
  scheme: 'acmetest',
  parserIds: ['customScheme'],
  description: 'Synthetic adapter fixture: registration, display, unavailable app, safe fallback.',
};

export const PAYMENT_HANDOFF_FIXTURES: CustomHandoffFixture[] = [
  {
    name: 'payment-bitcoin',
    raw: 'bitcoin:bc1qexampleaddress123?amount=0.001',
    scheme: 'bitcoin',
    parserIds: ['customScheme'],
    description: 'Generic bitcoin URI stays a handoff; no in-app transaction.',
  },
  {
    name: 'payment-payto',
    raw: 'payto://iban/DE75512108001245126199?amount=eur:10.0',
    scheme: 'payto',
    parserIds: ['customScheme'],
    description: 'Generic payto URI stays a handoff; no verification claimed.',
  },
  {
    name: 'payment-upi',
    raw: 'upi://pay?pa=alice@bank&pn=Alice&am=10.00&cu=INR',
    scheme: 'upi',
    parserIds: ['customScheme'],
    description: 'Generic UPI URI stays a handoff; confirm in the payment app.',
  },
];

export const CUSTOM_HANDOFF_FIXTURES: CustomHandoffFixture[] = [
  SYNTHETIC_HANDOFF_FIXTURE,
  ...PAYMENT_HANDOFF_FIXTURES,
];
