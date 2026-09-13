import { createContext, useContext, type ReactNode } from 'react';

import type { StoredHistoryEvent } from '@/history/historyPolicy';

export type HistoryActions = {
  deleteEvent: (id: string) => Promise<void>;
  restoreEvent: (event: StoredHistoryEvent) => Promise<void>;
  clearEvents: () => Promise<void>;
};

const HistoryEventsContext = createContext<StoredHistoryEvent[]>([]);
const HistoryActionsContext = createContext<HistoryActions | null>(null);

export function HistoryEventsProvider({
  events,
  actions,
  children,
}: {
  events: StoredHistoryEvent[];
  actions?: HistoryActions | null;
  children: ReactNode;
}) {
  return (
    <HistoryEventsContext.Provider value={events}>
      <HistoryActionsContext.Provider value={actions ?? null}>
        {children}
      </HistoryActionsContext.Provider>
    </HistoryEventsContext.Provider>
  );
}

export function useHistoryEvents(): StoredHistoryEvent[] {
  return useContext(HistoryEventsContext);
}

export function useHistoryActions(): HistoryActions | null {
  return useContext(HistoryActionsContext);
}
