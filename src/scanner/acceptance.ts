export const SCAN_STABLE_MS = 250;
export const SCAN_RESET_MS = 2000;

export function normalizeScanPayload(raw: string): string {
  return raw.normalize('NFC').trim();
}

export type ScanAcceptanceTrack = {
  firstSeenAtMs: number;
  consecutiveCount: number;
  lastSeenAtMs: number;
  acceptedAtMs: number | null;
  samplePayload: string;
};

export type ScanAcceptanceState = {
  readonly tracks: Record<string, ScanAcceptanceTrack>;
  readonly prevKeys: readonly string[];
};

export type AcceptedScan = {
  payload: string;
  normalized: string;
  acceptedAt: Date;
};

export type ScanAcceptanceResult = {
  state: ScanAcceptanceState;
  accepted: AcceptedScan[];
};

export type ScanAcceptanceInput = string | { rawPayload: string };

export function createInitialScanAcceptanceState(): ScanAcceptanceState {
  return { tracks: {}, prevKeys: [] };
}

function rawPayloadOf(input: ScanAcceptanceInput): string | null {
  if (typeof input === 'string') {
    return input;
  }
  if (input && typeof input.rawPayload === 'string') {
    return input.rawPayload;
  }
  return null;
}

export function updateScanAcceptance(
  state: ScanAcceptanceState,
  observations: readonly ScanAcceptanceInput[],
  now: Date,
): ScanAcceptanceResult {
  const nowMs = now.getTime();

  const ordered: { key: string; raw: string }[] = [];
  const seenInFrame = new Set<string>();
  for (const observation of observations) {
    const raw = rawPayloadOf(observation);
    if (raw == null) {
      continue;
    }
    const key = normalizeScanPayload(raw);
    if (key === '') {
      continue;
    }
    if (seenInFrame.has(key)) {
      continue;
    }
    seenInFrame.add(key);
    ordered.push({ key, raw });
  }

  const currentKeys = ordered.map((item) => item.key);
  const currentKeySet = new Set(currentKeys);
  const prevKeySet = new Set(state.prevKeys);

  const nextTracks: Record<string, ScanAcceptanceTrack> = { ...state.tracks };
  const accepted: AcceptedScan[] = [];

  for (const { key, raw } of ordered) {
    const prevTrack = state.tracks[key];
    if (!prevTrack) {
      const track: ScanAcceptanceTrack = {
        firstSeenAtMs: nowMs,
        consecutiveCount: 1,
        lastSeenAtMs: nowMs,
        acceptedAtMs: null,
        samplePayload: raw,
      };
      // Single fresh observation is never stable on its own.
      nextTracks[key] = track;
      continue;
    }

    const gapMs = nowMs - prevTrack.lastSeenAtMs;
    const wasInPrevFrame = prevKeySet.has(key);

    if (gapMs >= SCAN_RESET_MS) {
      // Long absence expires deduplication and restarts the stability window.
      // The first sighting after expiry still needs its own stabilization.
      const resetTrack: ScanAcceptanceTrack = {
        firstSeenAtMs: nowMs,
        consecutiveCount: 1,
        lastSeenAtMs: nowMs,
        acceptedAtMs: null,
        samplePayload: raw,
      };
      nextTracks[key] = resetTrack;
      continue;
    }

    if (prevTrack.acceptedAtMs != null) {
      // Still inside the 2s dedup window: continuous presence or a brief
      // flicker must not produce another event or haptic.
      const deduped: ScanAcceptanceTrack = {
        firstSeenAtMs: prevTrack.firstSeenAtMs,
        consecutiveCount: wasInPrevFrame ? prevTrack.consecutiveCount + 1 : 1,
        lastSeenAtMs: nowMs,
        acceptedAtMs: prevTrack.acceptedAtMs,
        samplePayload: raw,
      };
      nextTracks[key] = deduped;
      continue;
    }

    const firstSeenAtMs = prevTrack.firstSeenAtMs;
    const consecutiveCount = wasInPrevFrame ? prevTrack.consecutiveCount + 1 : 1;
    const stableDurationMs = nowMs - firstSeenAtMs;
    const isStable = consecutiveCount >= 2 || stableDurationMs >= SCAN_STABLE_MS;

    if (isStable) {
      const acceptedTrack: ScanAcceptanceTrack = {
        firstSeenAtMs,
        consecutiveCount,
        lastSeenAtMs: nowMs,
        acceptedAtMs: nowMs,
        samplePayload: raw,
      };
      nextTracks[key] = acceptedTrack;
      accepted.push({ payload: raw, normalized: key, acceptedAt: new Date(nowMs) });
    } else {
      nextTracks[key] = {
        firstSeenAtMs,
        consecutiveCount,
        lastSeenAtMs: nowMs,
        acceptedAtMs: null,
        samplePayload: raw,
      };
    }
  }

  // Prune tracks that have been absent for at least the reset window to keep
  // state bounded. Reappearance after pruning behaves like expiry above.
  for (const key of Object.keys(nextTracks)) {
    if (currentKeySet.has(key)) {
      continue;
    }
    const track = nextTracks[key];
    if (nowMs - track.lastSeenAtMs >= SCAN_RESET_MS) {
      delete nextTracks[key];
    }
  }

  return { state: { tracks: nextTracks, prevKeys: currentKeys }, accepted };
}
