import type { AcceptedScan } from '@/scanner/acceptance';
import { parseQRPayload, type ParsedQRPayload } from '@/scanner/payloadParser';

import {
  toStorableHistoryEvent,
  type StoredHistoryEvent,
} from './historyPolicy';

export type { StoredHistoryEvent };

export const HISTORY_SCHEMA_VERSION = 1;
export const HISTORY_FILE_NAME = 'history-v1.json';

type HistoryEnvelope = {
  version: number;
  events: StoredHistoryEvent[];
};

/**
 * Minimal file abstraction so the store logic stays testable without native
 * modules. Production injects the expo-file-system driver
 * (`historyExpoFileIO.ts`); tests inject the in-memory or node drivers below.
 * The store performs no network I/O by construction: this interface has none.
 */
export type HistoryFileIO = {
  readTextFile(path: string): Promise<string | null>;
  writeTextFileAtomic(path: string, text: string): Promise<void>;
  removeFile(path: string): Promise<void>;
};

export class InMemoryHistoryFileIO implements HistoryFileIO {
  private readonly files = new Map<string, string>();

  async readTextFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async writeTextFileAtomic(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(path);
  }
}

export type NodeFsLike = {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, text: string, encoding: 'utf8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options?: { force?: boolean }): Promise<void>;
};

/** Real-filesystem driver used by integration tests (relaunch round-trips). */
export function nodeHistoryFileIO(fs: NodeFsLike): HistoryFileIO {
  return {
    async readTextFile(path: string): Promise<string | null> {
      try {
        return await fs.readFile(path, 'utf8');
      } catch {
        return null;
      }
    },
    async writeTextFileAtomic(path: string, text: string): Promise<void> {
      const tempPath = `${path}.tmp-${process.pid}`;
      await fs.writeFile(tempPath, text, 'utf8');
      await fs.rename(tempPath, path);
    },
    async removeFile(path: string): Promise<void> {
      try {
        await fs.rm(path, { force: true });
      } catch {
        // Missing file is already the desired end state.
      }
    },
  };
}

function isValidEvent(value: unknown): value is StoredHistoryEvent {
  if (typeof value !== 'object' || value == null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    event.id.length > 0 &&
    typeof event.acceptedAt === 'string' &&
    Number.isNaN(Date.parse(event.acceptedAt)) === false &&
    typeof event.kind === 'string' &&
    event.kind.length > 0 &&
    (typeof event.summary === 'string' || event.summary === null) &&
    (typeof event.original === 'string' || event.original === null) &&
    typeof event.parserVersion === 'number'
  );
}

function parseEnvelope(text: string | null): HistoryEnvelope {
  if (text == null) {
    return { version: HISTORY_SCHEMA_VERSION, events: [] };
  }
  try {
    const raw = JSON.parse(text) as { version?: unknown; events?: unknown };
    if (raw.version !== HISTORY_SCHEMA_VERSION || !Array.isArray(raw.events)) {
      return { version: HISTORY_SCHEMA_VERSION, events: [] };
    }
    return {
      version: HISTORY_SCHEMA_VERSION,
      events: raw.events.filter(isValidEvent),
    };
  } catch {
    return { version: HISTORY_SCHEMA_VERSION, events: [] };
  }
}

export type HistoryStoreConfig = {
  fileIO: HistoryFileIO;
  /** Sandbox-local directory that already exists (or is creatable by the driver host). */
  directory: string;
  fileName?: string;
};

/**
 * Local-only persistent history (schema v1). The store exposes no
 * observation API by design: rows are created exclusively through
 * `recordAccepted`, which callers must invoke downstream of the scan
 * acceptance gate, so non-accepted observations can never create rows.
 */
export class HistoryStore {
  private readonly fileIO: HistoryFileIO;
  private readonly filePath: string;
  private events: StoredHistoryEvent[];
  private pending: Promise<void> = Promise.resolve();

  private constructor(fileIO: HistoryFileIO, filePath: string, events: StoredHistoryEvent[]) {
    this.fileIO = fileIO;
    this.filePath = filePath;
    this.events = events;
  }

  static async open(config: HistoryStoreConfig): Promise<HistoryStore> {
    const fileName = config.fileName ?? HISTORY_FILE_NAME;
    const filePath = `${config.directory.replace(/\/+$/, '')}/${fileName}`;
    const text = await config.fileIO.readTextFile(filePath);
    return new HistoryStore(config.fileIO, filePath, parseEnvelope(text).events);
  }

  get path(): string {
    return this.filePath;
  }

  /** Newest first. Awaits all previously queued writes. */
  async list(): Promise<StoredHistoryEvent[]> {
    await this.pending;
    return [...this.events].reverse();
  }

  recordAccepted(parsed: ParsedQRPayload, acceptedAt: Date): Promise<StoredHistoryEvent> {
    const event = toStorableHistoryEvent(parsed, acceptedAt);
    this.pending = this.pending.then(async () => {
      this.events.push(event);
      await this.persist();
    });
    return this.pending.then(() => event);
  }

  clear(): Promise<void> {
    this.pending = this.pending.then(async () => {
      this.events = [];
      await this.persist();
    });
    return this.pending;
  }

  private async persist(): Promise<void> {
    const envelope: HistoryEnvelope = {
      version: HISTORY_SCHEMA_VERSION,
      events: this.events,
    };
    await this.fileIO.writeTextFileAtomic(this.filePath, JSON.stringify(envelope));
  }
}

/**
 * Records one acceptance-gate event through the storage policy. This is the
 * only path from live scanning into persistent history.
 */
export function recordAcceptedScan(
  store: HistoryStore,
  accepted: AcceptedScan,
): Promise<StoredHistoryEvent> {
  return store.recordAccepted(parseQRPayload(accepted.payload), accepted.acceptedAt);
}
