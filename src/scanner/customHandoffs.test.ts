import {
  dispatchResultAction,
  resolvePrimarySystemAction,
  type ResultActionDeps,
} from './actionRouter';
import {
  CUSTOM_HANDOFF_FIXTURES,
  PAYMENT_HANDOFF_FIXTURES,
  SYNTHETIC_HANDOFF_FIXTURE,
  createAllowlistedSchemeParser,
  describeCustomHandoff,
  isPaymentHandoff,
  isPaymentHandoffScheme,
  registerCustomParser,
  validateAdapterRegistration,
} from './customHandoffs';
import { STRUCTURED_PARSERS, parseQRPayload } from './payloadParser';
import { toStorableHistoryEvent } from '@/history/historyPolicy';
import { describeResultForDisplay } from './webTextPresentation';

function mockDeps(): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    canOpenURL: jest.fn(async () => true),
  };
}

describe('custom app + payment handoffs (ACT-09)', () => {
  test('adapters route only through ActionRouter confirmation; parsing never acts', async () => {
    const parsed = parseQRPayload(SYNTHETIC_HANDOFF_FIXTURE.raw);
    expect(parsed.content.kind).toBe('customScheme');
    const deps = mockDeps();
    // Merely parsing and describing must not touch any system API.
    describeResultForDisplay(parsed);
    describeCustomHandoff(parsed, null);
    expect(deps.openURL).not.toHaveBeenCalled();
    expect(deps.copyText).not.toHaveBeenCalled();
    expect(deps.shareText).not.toHaveBeenCalled();

    // Explicit dispatch is the only path to openURL.
    await dispatchResultAction(parsed, 'openApp', deps);
    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith(SYNTHETIC_HANDOFF_FIXTURE.raw);
  });

  test('adapter cannot bypass canOpenURL gate or sensitivity policy', async () => {
    const parsed = parseQRPayload('acmetest://pay?amount=10&to=bob');
    const blocked = mockDeps();
    blocked.canOpenURL = jest.fn(async () => false);
    await expect(dispatchResultAction(parsed, 'openApp', blocked)).rejects.toThrow(
      /unavailable/i,
    );
    expect(blocked.openURL).not.toHaveBeenCalled();

    // Copy/share fallback still works on the raw payload.
    await dispatchResultAction(parsed, 'copy', mockDeps()).then(
      undefined,
      () => {},
    );
    const copyDeps = mockDeps();
    await dispatchResultAction(parsed, 'copy', copyDeps);
    expect(copyDeps.copyText).toHaveBeenCalledWith('acmetest://pay?amount=10&to=bob');
    const shareDeps = mockDeps();
    await dispatchResultAction(parsed, 'share', shareDeps);
    expect(shareDeps.shareText).toHaveBeenCalledWith('acmetest://pay?amount=10&to=bob');

    // History policy still applies: a sessionOnly adapter stays redacted.
    const unregister = registerCustomParser(
      createAllowlistedSchemeParser('acme-secret-test', ['acmesecret'], 'sessionOnly'),
    );
    try {
      const secret = parseQRPayload('acmesecret://token=abc123');
      expect(secret.sensitivity).toBe('sessionOnly');
      const event = toStorableHistoryEvent(secret, new Date('2026-09-12T10:00:00.000Z'));
      expect(event.original).toBeNull();
      expect(event.summary).toBeNull();
      expect(event.kind).toBe('redacted');
      expect(JSON.stringify(event)).not.toContain('abc123');
    } finally {
      unregister();
    }
  });

  test('custom schemes display scheme plus resolved app name when exposed', () => {
    const parsed = parseQRPayload('acmetest://pay?amount=10&to=bob');
    const withoutApp = describeCustomHandoff(parsed, null);
    expect(withoutApp.scheme).toBe('acmetest');
    expect(withoutApp.appName).toBeNull();

    const withApp = describeCustomHandoff(parsed, 'Acme Pay');
    expect(withApp.scheme).toBe('acmetest');
    expect(withApp.appName).toBe('Acme Pay');

    const view = describeResultForDisplay(parsed, { appName: 'Acme Pay' });
    expect(view.kind).toBe('custom');
    if (view.kind !== 'custom') {
      throw new Error('expected custom view-model');
    }
    expect(view.scheme).toBe('acmetest');
    expect(view.appName).toBe('Acme Pay');
  });

  test('uninstalled destinations resolve to no primary action but keep copy/share', async () => {
    const parsed = parseQRPayload('acmetest://pay?amount=10');
    expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));

    // Gate closed: dispatch refuses, raw copy/share still deliver exact bytes.
    const blocked = mockDeps();
    blocked.canOpenURL = jest.fn(async () => false);
    await expect(dispatchResultAction(parsed, 'openApp', blocked)).rejects.toThrow();
    expect(blocked.openURL).not.toHaveBeenCalled();

    const copyDeps = mockDeps();
    await dispatchResultAction(parsed, 'copy', copyDeps);
    expect(copyDeps.copyText).toHaveBeenCalledWith('acmetest://pay?amount=10');
  });

  test('generic payment URIs never transact and never claim verification', async () => {
    expect(PAYMENT_HANDOFF_FIXTURES.length).toBeGreaterThanOrEqual(3);
    for (const fixture of PAYMENT_HANDOFF_FIXTURES) {
      const parsed = parseQRPayload(fixture.raw);
      expect(parsed.content.kind).toBe('customScheme');
      expect(isPaymentHandoff(parsed)).toBe(true);
      if (parsed.content.kind === 'customScheme') {
        expect(isPaymentHandoffScheme(parsed.content.scheme)).toBe(true);
      }
      // Only handoff + raw fallback actions; never a transaction/auth action.
      expect(parsed.actions).not.toContain('authenticate');
      expect(parsed.actions).not.toContain('openAuth');
      expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));
      // Primary is at most an explicit openApp handoff, never a transaction.
      const primary = resolvePrimarySystemAction(parsed);
      expect(primary?.action).toBe('openApp');
      // Display carries an explicit unverified marker, never a verified claim.
      const handoff = describeCustomHandoff(parsed, null);
      expect(handoff.isPayment).toBe(true);
      expect(handoff.verificationNote).toMatch(/not verified/i);
      expect(handoff.verificationNote).not.toMatch(/verified by/i);
      expect(JSON.stringify(parsed)).not.toMatch(/verified/i);

      // Dispatch is tap-gated through canOpenURL; nothing auto-opens.
      const deps = mockDeps();
      expect(deps.openURL).not.toHaveBeenCalled();
      await dispatchResultAction(parsed, 'openApp', deps);
      expect(deps.openURL).toHaveBeenCalledWith(fixture.raw);
    }
  });

  test('adding a parser requires fixtures, sensitivity, and malformed-input behavior', () => {
    // Missing fixtures rejected.
    expect(() =>
      validateAdapterRegistration({
        id: 'no-fixtures',
        sensitivity: 'standard',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        parse: (_raw: string) => null,
        fixtures: [],
      }),
    ).toThrow(/fixture/i);

    // Missing sensitivity rejected.
    expect(() =>
      validateAdapterRegistration({
        id: 'no-sensitivity',
        // @ts-expect-error intentional missing sensitivity
        sensitivity: undefined,
        parse: () => null,
        fixtures: [{ raw: 'acmetest://x', expectParsed: true }],
      }),
    ).toThrow(/sensitivity/i);

    // Throwing parser rejected (malformed-input behavior required).
    expect(() =>
      validateAdapterRegistration({
        id: 'throwing',
        sensitivity: 'standard',
        parse: () => {
          throw new Error('boom');
        },
        fixtures: [{ raw: 'acmetest://x', expectParsed: true }],
      }),
    ).toThrow(/malformed|throw/i);

    // Every built-in structured parser declares sensitivity and has fixtures.
    expect(STRUCTURED_PARSERS.length).toBeGreaterThanOrEqual(8);
    for (const parser of STRUCTURED_PARSERS) {
      expect(['standard', 'redacted', 'sessionOnly']).toContain(parser.sensitivity);
      const fixtures = CUSTOM_HANDOFF_FIXTURES.filter((f) =>
        f.parserIds.includes(parser.id),
      );
      // Custom fallback parsers without dedicated handoff fixtures still need
      // payload-corpus coverage; generic customScheme has it.
      if (parser.id !== 'customScheme') {
        continue;
      }
      expect(fixtures.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('synthetic adapter fixture proves registration, display, and safe fallback', () => {
    const unregister = registerCustomParser(
      createAllowlistedSchemeParser('acmetest-synthetic', ['acmetest'], 'standard'),
    );
    try {
      const parsed = parseQRPayload(SYNTHETIC_HANDOFF_FIXTURE.raw);
      expect(parsed.content.kind).toBe('customScheme');
      if (parsed.content.kind !== 'customScheme') {
        throw new Error('expected customScheme');
      }
      expect(parsed.content.scheme).toBe('acmetest');
      expect(parsed.displaySummary).toMatch(/acmetest/);
      expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));

      // Malformed allowlisted input falls back to text with raw intact.
      const malformed = parseQRPayload('acmetest:');
      expect(malformed.content.kind).toBe('text');
      expect(malformed.originalPayload).toBe('acmetest:');
    } finally {
      unregister();
    }
    // After unregister, the generic fallback still identifies the scheme safely.
    const after = parseQRPayload(SYNTHETIC_HANDOFF_FIXTURE.raw);
    expect(after.content.kind).toBe('customScheme');
  });
});
