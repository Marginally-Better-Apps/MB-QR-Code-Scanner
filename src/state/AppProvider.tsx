import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { bootstrapApp, type BootstrapResult } from '@/scanner/bootstrap';
import { setLocale } from '@/i18n';
import * as Localization from 'expo-localization';

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

  setLocale(Localization.getLocales()[0]?.languageTag ?? 'en');

  useEffect(() => {
    void value.appState.scannerSession.activateScanner();
    value.appState.scannerSession.handleLifecycle('active');
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

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
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
