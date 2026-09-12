import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HistoryScreen } from '@/components/HistoryScreen';
import type { ResultActionDeps } from '@/scanner/actionRouter';
import { parseQRPayload } from '@/scanner/payloadParser';
import { setLocale } from '@/i18n';

import { HistoryStore, nodeHistoryFileIO } from './historyStore';

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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qr-history-ui-'));
}

describe('history store to HistoryScreen (HIS-02)', () => {
  beforeEach(() => {
    setLocale('en');
  });

  test('events persisted on the real filesystem appear grouped', async () => {
    const directory = await makeTempDir();
    const store = await HistoryStore.open({
      fileIO: nodeHistoryFileIO(fs),
      directory,
    });

    await store.recordAccepted(
      parseQRPayload('https://example.com/today'),
      new Date('2026-09-12T17:00:00.000Z'),
    );
    await store.recordAccepted(
      parseQRPayload(
        'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
      ),
      new Date('2026-09-11T17:00:00.000Z'),
    );

    const relaunched = await HistoryStore.open({
      fileIO: nodeHistoryFileIO(fs),
      directory,
    });
    const events = await relaunched.list();

    render(
      <HistoryScreen
        events={events}
        now={new Date('2026-09-12T18:00:00.000Z')}
        timeZone="UTC"
        locale="en-US"
      />,
    );

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('example.com/today')).toBeTruthy();
    expect(screen.getByText('Sensitive scan')).toBeTruthy();
    expect(screen.queryByText(/JBSWY3DPEHPK3PXP/)).toBeNull();
    expect(screen.queryByTestId('history-empty')).toBeNull();

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('tapping a persisted URL reparses with the current parser and runs Scanner actions', async () => {
    const directory = await makeTempDir();
    const store = await HistoryStore.open({
      fileIO: nodeHistoryFileIO(fs),
      directory,
    });
    await store.recordAccepted(
      parseQRPayload('https://example.com/today'),
      new Date('2026-09-12T17:00:00.000Z'),
    );

    const relaunched = await HistoryStore.open({
      fileIO: nodeHistoryFileIO(fs),
      directory,
    });
    const events = await relaunched.list();
    const deps: ResultActionDeps & {
      openURL: jest.Mock;
      copyText: jest.Mock;
      shareText: jest.Mock;
    } = {
      openURL: jest.fn(async () => {}),
      copyText: jest.fn(async () => {}),
      shareText: jest.fn(async () => {}),
    };

    render(
      <HistoryScreen
        events={events}
        now={new Date('2026-09-12T18:00:00.000Z')}
        timeZone="UTC"
        locale="en-US"
        actionDeps={deps}
      />,
    );

    fireEvent.press(screen.getByText('example.com/today'));
    expect(screen.getByTestId('sticky-result-open')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-host').props.children).toBe('example.com');

    fireEvent.press(screen.getByTestId('sticky-result-open'));
    expect(deps.openURL).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\/today/),
    );
    fireEvent.press(screen.getByTestId('sticky-result-copy'));
    await act(async () => {});
    expect(deps.copyText).toHaveBeenCalledWith('https://example.com/today');
    fireEvent.press(screen.getByTestId('sticky-result-share'));
    await act(async () => {});
    expect(deps.shareText).toHaveBeenCalledWith('https://example.com/today');

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('tapping a persisted redacted row explains it was not saved and hides the secret', async () => {
    const directory = await makeTempDir();
    const store = await HistoryStore.open({
      fileIO: nodeHistoryFileIO(fs),
      directory,
    });
    await store.recordAccepted(
      parseQRPayload(
        'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
      ),
      new Date('2026-09-12T17:00:00.000Z'),
    );

    const relaunched = await HistoryStore.open({
      fileIO: nodeHistoryFileIO(fs),
      directory,
    });

    render(
      <HistoryScreen
        events={await relaunched.list()}
        now={new Date('2026-09-12T18:00:00.000Z')}
        timeZone="UTC"
        locale="en-US"
      />,
    );

    fireEvent.press(screen.getByText('Sensitive scan'));
    expect(screen.getByText('This sensitive code was not saved.')).toBeTruthy();
    expect(screen.queryByTestId('sticky-result-copy')).toBeNull();
    expect(screen.queryByTestId('sticky-result-share')).toBeNull();
    expect(screen.queryByText(/JBSWY3DPEHPK3PXP/)).toBeNull();
    expect(screen.queryByText(/otpauth/)).toBeNull();

    await fs.rm(directory, { recursive: true, force: true });
  });
});
