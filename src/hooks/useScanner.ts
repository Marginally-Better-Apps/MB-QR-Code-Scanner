import { useSyncExternalStore } from 'react';

import type { AppState, ScannerSessionStore } from '@/scanner';

export function useAppState(appState: AppState): AppState {
  const revision = useSyncExternalStore(
    (listener) => appState.subscribe(listener),
    () => appState.revision,
    () => appState.revision,
  );
  void revision;
  return appState;
}

export function useScannerSession(session: ScannerSessionStore): ScannerSessionStore {
  const revision = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.revision,
    () => session.revision,
  );
  void revision;
  return session;
}
