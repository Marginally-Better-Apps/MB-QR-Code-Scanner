import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { bootstrapApp, type BootstrapResult } from '@/scanner/bootstrap';
import { openProductionHistoryStore } from '@/history/historyExpoFileIO';
import { hydrateHistoryForSession } from '@/history/historyHydration';
import type { StoredHistoryEvent } from '@/history/historyPolicy';
import type { HistoryStore } from '@/history/historyStore';
import { setLocale } from '@/i18n';
import * as Localization from 'expo-localization';

import { HistoryEventsProvider, type HistoryActions } from './historyEvents';

const AppContext = createContext<BootstrapResult | null>(null);

export function AppProvider({
  children,
  bootstrap,
}: {
  children: ReactNode;
  bootstrap?: BootstrapResult;
}) {
  const value = useMemo(
    () => bootstrap ?? bootstrapApp(),
    [bootstrap],
  );
  const [historyEvents, setHistoryEvents] = useState<StoredHistoryEvent[]>([]);
  const historyStoreRef = useRef<HistoryStore | null>(null);

  setLocale(Localization.getLocales()[0]?.languageTag ?? 'en');

  const refreshHistory = useCallback(async () => {
    const store = historyStoreRef.current;
    if (store == null) {
      return;
    }
    setHistoryEvents(await store.list());
  }, []);

  const historyActions = useMemo<HistoryActions>(
    () => ({
      deleteEvent: async (id) => {
        await historyStoreRef.current?.delete(id);
        await refreshHistory();
      },
      restoreEvent: async (event) => {
        try {
          await historyStoreRef.current?.restore(event);
        } finally {
          await refreshHistory();
        }
      },
      clearEvents: async () => {
        await historyStoreRef.current?.clear();
        await refreshHistory();
      },
    }),
    [refreshHistory],
  );

  useEffect(() => {
    let cancelled = false;
    // Open the store and attach the acceptance listener before the scanner
    // starts so a fixture (or a very early live scan) can be recorded.
    void openProductionHistoryStore()
      .then(async (store) => {
        if (cancelled) {
          return;
        }
        if (store != null) {
          historyStoreRef.current = store;
          await hydrateHistoryForSession({
            store,
            session: value.appState.scannerSession,
            fixturesEnabled: value.fixturesEnabled,
            historyFixture: value.historyFixture,
            onEvents: (events) => {
              if (!cancelled) {
                setHistoryEvents(events);
              }
            },
          });
        }
        if (!cancelled) {
          void value.appState.scannerSession.activateScanner();
          value.appState.scannerSession.handleLifecycle('active');
        }
      })
      .catch(() => {
        if (!cancelled) {
          void value.appState.scannerSession.activateScanner();
          value.appState.scannerSession.handleLifecycle('active');
        }
      });
    return () => {
      cancelled = true;
      value.appState.scannerSession.setAcceptedScanListener(null);
    };
  }, [value]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') {
        value.appState.scannerSession.handleLifecycle('active');
      } else if (state === 'inactive') {
        value.appState.scannerSession.handleLifecycle('inactive');
      } else if (state === 'background') {
        value.appState.scannerSession.handleLifecycle('background');
      }
    });
    return () => sub.remove();
  }, [value]);

  return (
    <AppContext.Provider value={value}>
      <HistoryEventsProvider events={historyEvents} actions={historyActions}>
        {children}
      </HistoryEventsProvider>
    </AppContext.Provider>
  );
}

export function useBootstrappedApp(): BootstrapResult {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('AppProvider is missing');
  }
  return value;
}

export function TabPresentationSync() {
  const pathname = usePathname();
  const { appState } = useBootstrappedApp();

  useEffect(() => {
    const onHistory = pathname.includes('history');
    appState.selectedTab = onHistory ? 'history' : 'scanner';
    appState.scannerSession.handlePresentation(onHistory ? 'obscured' : 'visible');
  }, [pathname, appState]);

  return null;
}

export function useAppRouter() {
  return useRouter();
}
