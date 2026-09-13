import { parseQRPayload } from './payloadParser';
import { toStorableHistoryEvent } from '@/history/historyPolicy';

describe('Wi-Fi payloads (ACT-06)', () => {
  test('parses SSID, hidden flag, security, and escaped delimiters', () => {
    const raw = 'WIFI:T:WPA3;S:my\\;net\\:1;P:p\\;ass;H:true;;';
    const parsed = parseQRPayload(raw);
    expect(parsed.content.kind).toBe('wifi');
    if (parsed.content.kind !== 'wifi') {
      throw new Error('expected wifi');
    }
    expect(parsed.content.ssid).toBe('my;net:1');
    expect(parsed.content.security).toBe('WPA3');
    expect(parsed.content.hidden).toBe(true);
    expect(parsed.content.hasPassword).toBe(true);
    expect(parsed.content.password).toBe('p;ass');
    expect(parsed.actions).toEqual(expect.arrayContaining(['joinWifi', 'copy', 'share']));
  });

  test('history stores a generic Wi-Fi row without SSID or password', () => {
    const parsed = parseQRPayload('WIFI:T:WPA;S:HomeNet;P:supersecret;;');
    const row = toStorableHistoryEvent(parsed, new Date('2026-09-12T12:00:00.000Z'), 'id-1');
    expect(row.kind).toBe('wifi');
    expect(row.summary).toBe('Wi-Fi network');
    expect(row.original).toBeNull();
    expect(JSON.stringify(row)).not.toContain('supersecret');
    expect(JSON.stringify(row)).not.toContain('HomeNet');
  });

  test('malformed Wi-Fi falls back without losing the raw value', () => {
    const raw = 'WIFI:T:WPA;S:home;P:secret';
    const parsed = parseQRPayload(raw);
    expect(parsed.content.kind).toBe('text');
    expect(parsed.originalPayload).toBe(raw);
  });
});
