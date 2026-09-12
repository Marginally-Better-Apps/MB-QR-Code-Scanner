import { createContext, useContext, type ReactNode } from 'react';

import type { StoredHistoryEvent } from '@/history/historyPolicy';

const HistoryEventsContext = createContext<StoredHistoryEvent[]>([]);

export function HistoryEventsProvider({
  events,
  children,
}: {
  events: StoredHistoryEvent[];
  children: ReactNode;
}) {
  return (
    <HistoryEventsContext.Provider value={events}>{children}</HistoryEventsContext.Provider>
  );
}

export function useHistoryEvents(): StoredHistoryEvent[] {
  return useContext(HistoryEventsContext);
}
