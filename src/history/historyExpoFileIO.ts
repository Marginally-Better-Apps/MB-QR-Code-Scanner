import {
  deleteAsync,
  documentDirectory,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import { HistoryStore, type HistoryFileIO } from './historyStore';

/**
 * Production file driver: a single JSON envelope inside the app sandbox
 * (`Documents/history/`). Never imported by tests, so Jest never loads the
 * native module. No network API is used anywhere in this file.
 */
export const HISTORY_DIRECTORY_NAME = 'history';

export function expoHistoryFileIO(): HistoryFileIO {
  return {
    async readTextFile(path: string): Promise<string | null> {
      try {
        return await readAsStringAsync(path);
      } catch {
        return null;
      }
    },
    async writeTextFileAtomic(path: string, text: string): Promise<void> {
      await writeAsStringAsync(path, text);
    },
    async removeFile(path: string): Promise<void> {
      try {
        await deleteAsync(path, { idempotent: true });
      } catch {
        // Missing file is already the desired end state.
      }
    },
  };
}

/**
 * Opens the production history store. Returns null when the sandbox
 * document directory is unavailable (e.g. restricted profiles); scanning
 * continues without persistence in that case.
 */
export async function openProductionHistoryStore(): Promise<HistoryStore | null> {
  if (documentDirectory == null) {
    return null;
  }
  const directory = `${documentDirectory}${HISTORY_DIRECTORY_NAME}`;
  try {
    await makeDirectoryAsync(directory, { intermediates: true });
  } catch {
    return null;
  }
  try {
    return await HistoryStore.open({ fileIO: expoHistoryFileIO(), directory });
  } catch {
    return null;
  }
}
