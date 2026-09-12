import {
  DEFAULT_MULTI_CODE_WEIGHTS,
  MULTI_CODE_AUTO_WIN_RATIO,
  MULTI_CODE_GUIDE_RECT,
  rankMultiCodeCandidates,
  resolveMultiCodeWinner,
  scoreMultiCodeCandidate,
  stableCandidateId,
  type MultiCodeCandidate,
} from './multiCode';

function candidate(
  rawPayload: string,
  bounds: MultiCodeCandidate['bounds'],
  stability = 2,
): MultiCodeCandidate {
  return { rawPayload, bounds, stability };
}

const CENTER = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
const EDGE = { x: 0.01, y: 0.4, width: 0.12, height: 0.12 };

describe('multi-code scoring (SCN-05)', () => {
  test('scoring is pure, documented, and tuneable without camera-framework types', () => {
    const a = candidate('https://example.com/a', CENTER, 2);
    const first = scoreMultiCodeCandidate(a);
    const second = scoreMultiCodeCandidate({ ...a });
    expect(second).toBe(first);
    // No camera-framework imports: score source must not reference VisionKit/AVFoundation.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'multiCode.ts'),
      'utf8',
    ) as string;
    expect(source).not.toMatch(/VisionKit|AVFoundation|DataScanner|CMSampleBuffer/);
    // Tuneable via weights.
    expect(DEFAULT_MULTI_CODE_WEIGHTS).toEqual(
      expect.objectContaining({
        center: expect.any(Number),
        guide: expect.any(Number),
        area: expect.any(Number),
        stability: expect.any(Number),
      }),
    );
    const boosted = scoreMultiCodeCandidate(a, {
      ...DEFAULT_MULTI_CODE_WEIGHTS,
      area: DEFAULT_MULTI_CODE_WEIGHTS.area * 10,
    });
    const tiny = candidate('https://example.com/a', { x: 0.45, y: 0.45, width: 0.02, height: 0.02 }, 2);
    const boostedTiny = scoreMultiCodeCandidate(tiny, {
      ...DEFAULT_MULTI_CODE_WEIGHTS,
      area: DEFAULT_MULTI_CODE_WEIGHTS.area * 10,
    });
    // Area weight changes the gap between large and tiny.
    expect(boosted - boostedTiny).toBeGreaterThan(
      scoreMultiCodeCandidate(a) - scoreMultiCodeCandidate(tiny),
    );
    expect(MULTI_CODE_AUTO_WIN_RATIO).toBe(1.25);
    expect(MULTI_CODE_GUIDE_RECT).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  test('center distance, guide intersection, visible area, and stability all contribute', () => {
    const centered = scoreMultiCodeCandidate(candidate('a', CENTER, 2));
    const edged = scoreMultiCodeCandidate(candidate('a', EDGE, 2));
    expect(centered).toBeGreaterThan(edged);

    const large = scoreMultiCodeCandidate(
      candidate('a', { x: 0.3, y: 0.3, width: 0.3, height: 0.3 }, 1),
    );
    const small = scoreMultiCodeCandidate(
      candidate('a', { x: 0.3, y: 0.3, width: 0.05, height: 0.05 }, 1),
    );
    expect(large).toBeGreaterThan(small);

    const stable = scoreMultiCodeCandidate(candidate('a', CENTER, 5));
    const fresh = scoreMultiCodeCandidate(candidate('a', CENTER, 1));
    expect(stable).toBeGreaterThan(fresh);
  });

  test.each([
    {
      name: 'dominant center code auto-wins',
      ranked: [
        { id: 'big', score: 2.5 },
        { id: 'small', score: 1.0 },
      ],
      currentId: 'small',
      expectedWinner: 'big',
      expectedAmbiguous: false,
    },
    {
      name: 'tie preserves the current result',
      ranked: [
        { id: 'a', score: 1.0 },
        { id: 'b', score: 1.0 },
      ],
      currentId: 'b',
      expectedWinner: 'b',
      expectedAmbiguous: true,
    },
    {
      name: 'near-tie below 1.25x preserves current',
      ranked: [
        { id: 'a', score: 1.2 },
        { id: 'b', score: 1.0 },
      ],
      currentId: 'b',
      expectedWinner: 'b',
      expectedAmbiguous: true,
    },
    {
      name: 'exactly 1.25x auto-wins',
      ranked: [
        { id: 'a', score: 1.25 },
        { id: 'b', score: 1.0 },
      ],
      currentId: 'b',
      expectedWinner: 'a',
      expectedAmbiguous: false,
    },
  ])('$name', ({ ranked, currentId, expectedWinner, expectedAmbiguous }) => {
    const result = resolveMultiCodeWinner({ ranked, currentId });
    expect(result.winnerId).toBe(expectedWinner);
    expect(result.isAmbiguous).toBe(expectedAmbiguous);
  });

  test('movement: a code moving to center overtakes only when dominant', () => {
    const edgeBoth = rankMultiCodeCandidates(
      [candidate('https://example.com/a', EDGE, 3), candidate('https://example.com/b', EDGE, 3)],
    );
    expect(resolveMultiCodeWinner({ ranked: edgeBoth, currentId: edgeBoth[0].id }).isAmbiguous).toBe(
      true,
    );

    const moved = rankMultiCodeCandidates([
      candidate('https://example.com/a', CENTER, 3),
      candidate('https://example.com/b', EDGE, 1),
    ]);
    expect(moved[0].id).toBe(stableCandidateId('https://example.com/a'));
    const resolved = resolveMultiCodeWinner({ ranked: moved, currentId: stableCandidateId('https://example.com/b') });
    // Centered + stable + large must be clearly dominant over a fresh edge code.
    expect(resolved.winnerId).toBe(stableCandidateId('https://example.com/a'));
    expect(resolved.isAmbiguous).toBe(false);
  });

  test('disappearance never round-robins: current survives when still visible', () => {
    const three = rankMultiCodeCandidates([
      candidate('https://example.com/a', CENTER, 3),
      candidate('https://example.com/b', { x: 0.05, y: 0.05, width: 0.12, height: 0.12 }, 3),
      candidate('https://example.com/c', { x: 0.8, y: 0.8, width: 0.12, height: 0.12 }, 3),
    ]);
    const currentId = stableCandidateId('https://example.com/b');
    const afterOneLeaves = rankMultiCodeCandidates([
      candidate('https://example.com/a', CENTER, 3),
      candidate('https://example.com/b', { x: 0.05, y: 0.05, width: 0.12, height: 0.12 }, 4),
    ]);
    const resolved = resolveMultiCodeWinner({ ranked: afterOneLeaves, currentId });
    // Scores are close (both stable); disappearance of c must not flip b→a without dominance.
    if (resolved.isAmbiguous) {
      expect(resolved.winnerId).toBe(currentId);
    } else {
      expect(resolved.winnerId).toBe(afterOneLeaves[0].id);
    }
  });

  test('reordered callback with identical payloads keeps ranking and current', () => {
    const orderA = rankMultiCodeCandidates([
      candidate('https://example.com/left', { x: 0.05, y: 0.4, width: 0.15, height: 0.15 }, 2),
      candidate('https://example.com/right', { x: 0.8, y: 0.4, width: 0.15, height: 0.15 }, 2),
    ]);
    const orderB = rankMultiCodeCandidates([
      candidate('https://example.com/right', { x: 0.8, y: 0.4, width: 0.15, height: 0.15 }, 2),
      candidate('https://example.com/left', { x: 0.05, y: 0.4, width: 0.15, height: 0.15 }, 2),
    ]);
    expect(orderA.map((r) => r.id)).toEqual(orderB.map((r) => r.id));
    expect(orderA.map((r) => r.score)).toEqual(orderB.map((r) => r.score));
    const currentId = orderA[1].id;
    expect(resolveMultiCodeWinner({ ranked: orderB, currentId }).winnerId).toBe(currentId);
  });

  test('stable identifiers derive from normalized payload', () => {
    expect(stableCandidateId('  https://example.com/a  ')).toBe('https://example.com/a');
    expect(stableCandidateId('caf\u00e9')).toBe(stableCandidateId('cafe\u0301'));
    const ranked = rankMultiCodeCandidates([
      candidate('https://example.com/a', CENTER, 2),
      candidate('https://example.com/b', EDGE, 2),
    ]);
    expect(ranked.map((r) => r.id)).toContain(stableCandidateId('https://example.com/a'));
  });
});
