import type { Rect } from './types';

/**
 * Multi-code disambiguation (SCN-05).
 *
 * Pure, camera-framework-free scoring + winner resolution for several
 * simultaneously visible QR codes.
 *
 * Inputs are plain data only (`rawPayload`, normalized `Rect` bounds in
 * 0..1 preview space, and a frame-count `stability`). No native engine,
 * capture, or sample-buffer types appear here so the
 * function stays unit-testable and tuneable from TypeScript.
 *
 * Scoring signals (all 0..1 before weighting):
 * - `center`: 1 at the frame center (0.5, 0.5), decaying linearly to 0 at
 *   a corner. Rewards the code the user is most likely pointing at.
 * - `guide`: 1 when bounds intersect the guidance-only center square,
 *   else 0. The guide is coaching only (full frame still scans); this
 *   term only breaks ties toward the coached area.
 * - `area`: visible area (`width * height`) scaled so a ~0.3×0.3 code
 *   saturates at 1. Rewards large, confidently decodable codes.
 * - `stability`: consecutive-frame presence, saturating at 5 frames.
 *   Rewards codes that persist instead of flickering.
 *
 * Final score = dot(weights, signals). Tune via {@link DEFAULT_MULTI_CODE_WEIGHTS}
 * without touching call sites: pass a custom `weights` override to
 * {@link scoreMultiCodeCandidate} / {@link rankMultiCodeCandidates}.
 *
 * Auto-win rule: the top candidate wins outright only when
 * `top.score >= MULTI_CODE_AUTO_WIN_RATIO * runnerUp.score`
 * (default 1.25×). Otherwise the frame is ambiguous: the caller must
 * preserve the current result and surface the ranked chooser.
 * Ties therefore never replace the current result and reordered native
 * callbacks never round-robin it.
 */

/** Normalized guidance-only center square (matches ScanTargetGuide coaching). */
export const MULTI_CODE_GUIDE_RECT: Rect = {
  x: 0.25,
  y: 0.35,
  width: 0.5,
  height: 0.3,
};

/** Winner must score at least this multiple of the runner-up to auto-accept. */
export const MULTI_CODE_AUTO_WIN_RATIO = 1.25;

export type MultiCodeWeights = {
  center: number;
  guide: number;
  area: number;
  stability: number;
};

/** Default tuning. Adjust per device testing; keep the ratio constant separate. */
export const DEFAULT_MULTI_CODE_WEIGHTS: MultiCodeWeights = {
  center: 1.0,
  guide: 0.8,
  area: 1.2,
  stability: 0.6,
};

export type MultiCodeCandidate = {
  rawPayload: string;
  bounds: Rect;
  /** Consecutive frames this payload has been visible (>=1). Defaults to 1. */
  stability?: number;
};

export type ScoredMultiCodeCandidate = {
  id: string;
  rawPayload: string;
  bounds: Rect;
  stability: number;
  score: number;
};

/** Stable identifier for a candidate: NFC + trim (matches acceptance identity). */
export function stableCandidateId(rawPayload: string): string {
  try {
    return rawPayload.normalize('NFC').trim();
  } catch {
    return rawPayload.trim();
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

const MAX_CENTER_DISTANCE = Math.SQRT1_2; // dist((0,0),(0.5,0.5)) = ~0.7071

export function scoreMultiCodeCandidate(
  candidate: MultiCodeCandidate,
  weights: MultiCodeWeights = DEFAULT_MULTI_CODE_WEIGHTS,
): number {
  const center = rectCenter(candidate.bounds);
  const distance = Math.hypot(center.x - 0.5, center.y - 0.5);
  const centerScore = clamp01(1 - distance / MAX_CENTER_DISTANCE);
  const guideScore = rectsIntersect(candidate.bounds, MULTI_CODE_GUIDE_RECT) ? 1 : 0;
  const area = Math.max(0, candidate.bounds.width) * Math.max(0, candidate.bounds.height);
  const areaScore = clamp01(area * 10);
  const stability = Math.max(1, Math.floor(candidate.stability ?? 1));
  const stabilityScore = clamp01(stability / 5);

  return (
    weights.center * centerScore +
    weights.guide * guideScore +
    weights.area * areaScore +
    weights.stability * stabilityScore
  );
}

/**
 * Score and deterministically rank candidates (score desc, id asc).
 * Sorting by id as a tiebreak keeps reordered native callbacks stable.
 */
export function rankMultiCodeCandidates(
  candidates: readonly MultiCodeCandidate[],
  weights: MultiCodeWeights = DEFAULT_MULTI_CODE_WEIGHTS,
): ScoredMultiCodeCandidate[] {
  const scored = candidates.map((candidate) => {
    const stability = Math.max(1, Math.floor(candidate.stability ?? 1));
    return {
      id: stableCandidateId(candidate.rawPayload),
      rawPayload: candidate.rawPayload,
      bounds: candidate.bounds,
      stability,
      score: scoreMultiCodeCandidate(candidate, weights),
    };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return scored;
}

export type MultiCodeWinnerResolution = {
  winnerId: string | null;
  isAmbiguous: boolean;
};

/**
 * Decide the winner for one frame.
 * - 0 candidates → no winner, ambiguous (keep current, show empty).
 * - 1 candidate → that candidate wins outright (single-code path).
 * - 2+ → top wins only at >=1.25× runner-up; otherwise ambiguous and the
 *   current result is preserved when still visible (never round-robin).
 */
export function resolveMultiCodeWinner(input: {
  ranked: readonly { id: string; score: number }[];
  currentId: string | null;
}): MultiCodeWinnerResolution {
  const { ranked, currentId } = input;
  if (ranked.length === 0) {
    return { winnerId: null, isAmbiguous: true };
  }
  if (ranked.length === 1) {
    return { winnerId: ranked[0].id, isAmbiguous: false };
  }
  const [top, runnerUp] = ranked;
  const runnerScore = runnerUp.score;
  const dominant =
    runnerScore <= 0 ? top.score > 0 : top.score >= MULTI_CODE_AUTO_WIN_RATIO * runnerScore;
  if (dominant) {
    return { winnerId: top.id, isAmbiguous: false };
  }
  const ids = new Set(ranked.map((entry) => entry.id));
  if (currentId != null && ids.has(currentId)) {
    return { winnerId: currentId, isAmbiguous: true };
  }
  // Ambiguous with no usable current: keep nothing selected so the chooser
  // (not an arbitrary auto-pick) owns the decision. Callers keep the sticky
  // currentResult untouched in this case.
  return { winnerId: currentId ?? null, isAmbiguous: true };
}
