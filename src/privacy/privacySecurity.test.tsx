import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { announceAcceptedScan } from '@/a11y/announceAcceptedScan';
import { StickyResultBar } from '@/components/StickyResultBar';
import { AUTH_QR_FIXTURES } from '@/scanner/authQr';
import {
  dispatchResultAction,
  type ResultActionDeps,
} from '@/scanner/actionRouter';
import { ScannerObservationFixtureSource } from '@/scanner/fixtures';
import { parseQRPayload } from '@/scanner/payloadParser';
import { describeResultForDisplay } from '@/scanner/webTextPresentation';
import { setLocale } from '@/i18n';
import {
  HistoryStore,
  InMemoryHistoryFileIO,
  nodeHistoryFileIO,
} from '@/history/historyStore';
import { toStorableHistoryEvent } from '@/history/historyPolicy';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => {}),
}));

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children, ...props }: { children: unknown }) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
  isGlassEffectAPIAvailable: jest.fn(() => false),
  isLiquidGlassAvailable: jest.fn(() => false),
}));

jest.mock('expo-symbols', () => {
  const { Text } = require('react-native');
  return {
    SymbolView: ({ name, ...props }: { name: string }) => (
      <Text {...props}>{name}</Text>
    ),
  };
});

const OTP_RAW = AUTH_QR_FIXTURES.otpauthTotp;
const OTP_SECRET = AUTH_QR_FIXTURES.otpauthSecret;
const WIFI_RAW = 'WIFI:T:WPA;S:HomeNet;P:delete-me-secret;;';
const WIFI_PASSWORD = 'delete-me-secret';

function mockDeps(): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
  joinWifi: jest.Mock;
  presentContact: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    canOpenURL: jest.fn(async () => true),
    capabilities: {
      composeEmail: true,
      call: true,
      sendSms: true,
      openLocation: true,
      addContact: true,
      addEvent: true,
      joinWifi: true,
    },
    presentContact: jest.fn(async () => 'saved' as const),
    presentEvent: jest.fn(async () => 'saved' as const),
    joinWifi: jest.fn(async () => 'joined' as const),
  };
}

function at(msOffset: number): Date {
  return new Date(Date.UTC(2026, 8, 12, 10, 0, 0) + msOffset);
}

describe('privacy and payload security review (QLT-05)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('scanning, parsing, display, and history perform no network I/O', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no net'));
    try {
      const raws = [
        'https://example.com/some/path?q=1',
        'https://münchen.de/Grüße',
        'WIFI:T:WPA;S:HomeNet;P:supersecret;;',
        OTP_RAW,
        'just plain text',
      ];
      const store = await HistoryStore.open({
        fileIO: new InMemoryHistoryFileIO(),
        directory: '/tmp/privacy-net-test',
      });
      for (const raw of raws) {
        const parsed = parseQRPayload(raw);
        describeResultForDisplay(parsed);
        toStorableHistoryEvent(parsed, at(0));
        await store.recordAccepted(parsed, at(0));
      }
      await store.list();
      // Dispatching through the router touches only injected system APIs.
      const deps = mockDeps();
      await dispatchResultAction(
        parseQRPayload('https://example.com/x'),
        'openUrl',
        deps,
      );
      expect(deps.openURL).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('parsing, display, and history emit no logs', async () => {
    const logged: string[] = [];
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map((method) =>
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      }),
    );
    try {
      const store = await HistoryStore.open({
        fileIO: new InMemoryHistoryFileIO(),
        directory: '/tmp/privacy-log-test',
      });
      for (const raw of ['https://example.com/x', WIFI_RAW, OTP_RAW]) {
        const parsed = parseQRPayload(raw);
        describeResultForDisplay(parsed);
        await store.recordAccepted(parsed, at(0));
      }
      await store.list();
      expect(logged).toEqual([]);
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });

  test('observation frames carry payload metadata only, never image bytes', () => {
    const source = new ScannerObservationFixtureSource({ engineID: 'fixture.privacy' });
    const seen: Array<Record<string, unknown>> = [];
    source.start((frame) => {
      for (const observation of frame) {
        seen.push({ ...(observation as unknown as Record<string, unknown>) });
      }
    });
    source.emit([
      { rawPayload: 'https://example.com/a', displayBounds: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
    source.stop();
    expect(seen.length).toBeGreaterThan(0);
    for (const observation of seen) {
      expect(Object.keys(observation).sort()).toEqual(
        ['displayBounds', 'engineID', 'rawPayload', 'timestamp'],
      );
      expect(JSON.stringify(observation)).not.toMatch(
        /pixel|buffer|image|frame|base64|png|jpeg/i,
      );
    }
  });

  test('native frame path never persists, logs, or uploads frames', async () => {
    const iosDir = path.resolve(
      __dirname,
      '..',
      '..',
      'modules',
      'scanner-engine',
      'ios',
    );
    const frameFiles = ['ScannerPreviewView.swift', 'QRVisionDetector.swift'];
    const forbidden = [
      'UIImageWriteToSavedPhotosAlbum',
      'writeToFile',
      'NSLog',
      'os_log',
      'print(',
      'pngData',
      'jpegData',
      'base64Encoded',
      'PHPhotoLibrary',
      'FileManager',
      'UserDefaults',
      'URLSession',
      'dataTask',
      'uploadTask',
    ];
    for (const file of frameFiles) {
      const text = await fs.readFile(path.join(iosDir, file), 'utf8');
      for (const sink of forbidden) {
        expect(text).not.toContain(sink);
      }
    }
  });

  test('rendering a result never acts; every consequential action needs a tap', async () => {
    const cases: Array<{ payload: string; openLabel: string }> = [
      { payload: 'https://example.com/tap-gated', openLabel: 'Open link' },
      { payload: 'WIFI:T:WPA;S:HomeNet;P:supersecret;;', openLabel: 'Join' },
    ];
    for (const { payload, openLabel } of cases) {
      const deps = mockDeps();
      const { unmount } = render(
        <StickyResultBar payload={payload} onClear={() => {}} actionDeps={deps} />,
      );
      await act(async () => {});
      expect(deps.openURL).not.toHaveBeenCalled();
      expect(deps.copyText).not.toHaveBeenCalled();
      expect(deps.shareText).not.toHaveBeenCalled();
      expect(deps.joinWifi).not.toHaveBeenCalled();
      expect(deps.presentContact).not.toHaveBeenCalled();

      fireEvent.press(screen.getByLabelText(openLabel));
      await act(async () => {});
      if (payload.startsWith('WIFI:')) {
        expect(deps.joinWifi).toHaveBeenCalledTimes(1);
        expect(deps.openURL).not.toHaveBeenCalled();
      } else {
        expect(deps.openURL).toHaveBeenCalledTimes(1);
      }
      unmount();
    }
  });

  test('dangerous payloads render with no Open affordance', async () => {
    const deps = mockDeps();
    render(
      <StickyResultBar payload="javascript:alert(1)" onClear={() => {}} actionDeps={deps} />,
    );
    await act(async () => {});
    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('expanded Wi-Fi detail never exposes the password', () => {
    const deps = mockDeps();
    render(<StickyResultBar payload={WIFI_RAW} onClear={() => {}} actionDeps={deps} />);
    fireEvent.press(screen.getByTestId('sticky-result-expand'));
    const detail = screen.getByTestId('sticky-result-full-payload').props.children;
    expect(String(detail)).not.toContain(WIFI_PASSWORD);
    expect(String(detail)).toContain('HomeNet');
  });

  test('accepted-scan announcements never speak secrets', () => {
    const messages: string[] = [];
    announceAcceptedScan(OTP_RAW, (message) => messages.push(message));
    announceAcceptedScan(WIFI_RAW, (message) => messages.push(message));
    announceAcceptedScan(
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCtestkeymaterial\n-----END PRIVATE KEY-----',
      (message) => messages.push(message),
    );
    expect(messages).toHaveLength(3);
    const combined = messages.join('\n');
    expect(combined).not.toContain(OTP_SECRET);
    expect(combined).not.toContain(WIFI_PASSWORD);
    expect(combined).not.toContain('testkeymaterial');
  });

  test('deleting history purges the stored payload bytes from disk', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'qr-privacy-delete-'));
    try {
      const marker = `https://example.com/purge-marker-${Date.now()}`;
      const fileIO = nodeHistoryFileIO(fs);
      const store = await HistoryStore.open({ fileIO, directory });
      const event = await store.recordAccepted(parseQRPayload(marker), at(0));
      const filePath = path.join(directory, 'history-v1.json');
      expect(await fs.readFile(filePath, 'utf8')).toContain(marker);

      await store.delete(event.id);
      const afterDelete = await fs.readFile(filePath, 'utf8');
      expect(afterDelete).not.toContain(marker);

      const relaunched = await HistoryStore.open({ fileIO, directory });
      const events = await relaunched.list();
      expect(events.map((item) => item.id)).not.toContain(event.id);
      expect(JSON.stringify(events)).not.toContain(marker);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  test('session-only rows never land secret bytes on disk', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'qr-privacy-otp-'));
    try {
      const fileIO = nodeHistoryFileIO(fs);
      const store = await HistoryStore.open({ fileIO, directory });
      await store.recordAccepted(parseQRPayload(OTP_RAW), at(0));
      const raw = await fs.readFile(path.join(directory, 'history-v1.json'), 'utf8');
      expect(raw).not.toContain(OTP_SECRET);
      expect(raw).not.toContain(OTP_RAW);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
