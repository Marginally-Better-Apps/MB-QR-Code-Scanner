import { dispatchResultAction } from './actionRouter';
import { AUTH_QR_FIXTURES, recognizeAuthQr } from './authQr';
import { parseQRPayload } from './payloadParser';
import { describeResultForDisplay } from './webTextPresentation';

describe('auth QR recognition (ACT-07)', () => {
  test('recognizes otpauth totp and hotp without treating them as custom schemes', () => {
    const totp = recognizeAuthQr(AUTH_QR_FIXTURES.otpauthTotp);
    expect(totp).toEqual({
      format: 'otpauth',
      summary: 'Authentication code (Example)',
      label: 'alice@example.com',
      issuer: 'Example',
    });

    const hotp = recognizeAuthQr(AUTH_QR_FIXTURES.otpauthHotp);
    expect(hotp?.format).toBe('otpauth');
    expect(hotp?.issuer).toBe('Example');

    const parsed = parseQRPayload(AUTH_QR_FIXTURES.otpauthTotp);
    expect(parsed.content.kind).toBe('otp');
    expect(parsed.sensitivity).toBe('sessionOnly');
    expect(parsed.displaySummary).toBe('Authentication code (Example)');
    expect(parsed.displaySummary).not.toContain(AUTH_QR_FIXTURES.otpauthSecret);
    expect(parsed.actions).not.toContain('copy');
    expect(parsed.actions).not.toContain('share');
    expect(parsed.actions).not.toContain('openApp');
  });

  test('recognizes otpauth-migration export blobs as secret-bearing auth, not custom schemes', () => {
    const recognized = recognizeAuthQr(AUTH_QR_FIXTURES.otpMigration);
    expect(recognized).toEqual({
      format: 'otpauth-migration',
      summary: 'Authenticator export',
      label: null,
      issuer: null,
    });

    const parsed = parseQRPayload(AUTH_QR_FIXTURES.otpMigration);
    expect(parsed.content.kind).toBe('otp');
    expect(parsed.sensitivity).toBe('sessionOnly');
    expect(parsed.displaySummary).toBe('Authenticator export');
    expect(parsed.displaySummary).not.toContain(AUTH_QR_FIXTURES.otpMigrationData);
    expect(parsed.displaySummary).not.toMatch(/data=/i);
    expect(parsed.actions).not.toContain('copy');
    expect(parsed.actions).not.toContain('share');
    expect(parsed.actions).not.toContain('openApp');
  });

  test('recognizes FIDO hybrid QR digit payloads without decoding the tunnel secret', () => {
    const recognized = recognizeAuthQr(AUTH_QR_FIXTURES.fidoHybrid);
    expect(recognized).toEqual({
      format: 'fido-hybrid',
      summary: 'Passkey sign-in',
      label: null,
      issuer: null,
    });

    const parsed = parseQRPayload(AUTH_QR_FIXTURES.fidoHybrid);
    expect(parsed.content.kind).toBe('passkey');
    expect(parsed.sensitivity).toBe('sessionOnly');
    expect(parsed.displaySummary).toBe('Passkey sign-in');
    expect(parsed.displaySummary).not.toContain(AUTH_QR_FIXTURES.fidoDigits);
    expect(parsed.actions).not.toContain('copy');
    expect(parsed.actions).not.toContain('share');
    expect(parsed.actions).not.toContain('openApp');
    expect(parsed.actions).not.toContain('openUrl');
  });

  test('does not claim FIDO double-slash or short digit strings', () => {
    expect(recognizeAuthQr('FIDO://example.invalid/hybrid')).toBeNull();
    expect(recognizeAuthQr('FIDO:/123')).toBeNull();
    expect(recognizeAuthQr('https://example.com/fido-help')).toBeNull();
    expect(recognizeAuthQr('Call Fido at noon')).toBeNull();
  });

  test('compact and expanded presentation never include secret material', () => {
    for (const raw of [
      AUTH_QR_FIXTURES.otpauthTotp,
      AUTH_QR_FIXTURES.otpMigration,
      AUTH_QR_FIXTURES.fidoHybrid,
    ]) {
      const parsed = parseQRPayload(raw);
      const view = describeResultForDisplay(parsed);
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain(AUTH_QR_FIXTURES.otpauthSecret);
      expect(serialized).not.toContain(AUTH_QR_FIXTURES.otpMigrationData);
      expect(serialized).not.toContain(AUTH_QR_FIXTURES.fidoDigits);
      expect(serialized).not.toContain(raw);
    }
  });

  test('authenticate remains unimplemented and never opens, copies, or shares', async () => {
    const deps = {
      openURL: jest.fn(async () => {}),
      copyText: jest.fn(async () => {}),
      shareText: jest.fn(async () => {}),
    };
    for (const raw of [
      AUTH_QR_FIXTURES.otpauthTotp,
      AUTH_QR_FIXTURES.otpMigration,
      AUTH_QR_FIXTURES.fidoHybrid,
    ]) {
      const parsed = parseQRPayload(raw);
      await expect(dispatchResultAction(parsed, 'authenticate', deps)).rejects.toThrow(
        /not implemented|not handled/i,
      );
      expect(deps.openURL).not.toHaveBeenCalled();
      expect(deps.copyText).not.toHaveBeenCalled();
      expect(deps.shareText).not.toHaveBeenCalled();
    }
  });
});
