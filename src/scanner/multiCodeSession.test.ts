import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { ScannerObservationFixtureSource } from '@/scanner/fixtures';
import { ScannerSessionStore } from '@/scanner/session';
import { stableCandidateId } from '@/scanner/multiCode';

function bounds(x = 0.1, y = 0.1, w = 0.2, h = 0.2) {
  return { x, y, width: w, height: h };
}

function makeSession(engineID = 'fixture.multicode') {
  const source = new ScannerObservationFixtureSource({ engineID });
  const session = new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: source,
  });
  return { source, session };
}

describe('multi-code session disambiguation (SCN-05)', () => {
  test('single code still becomes current', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();
    source.emit([{ rawPayload: 'https://example.com/only', displayBounds: bounds() }]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/only');
  });

  test('dominant code auto-wins and replaces current', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();
    // Seed a current result with one code.
    source.emit([{ rawPayload: 'https://example.com/edge', displayBounds: bounds(0.01, 0.4, 0.12, 0.12) }]);
    source.emit([{ rawPayload: 'https://example.com/edge', displayBounds: bounds(0.01, 0.4, 0.12, 0.12) }]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/edge');

    // A large centered code alongside the small edge code must dominate.
    const center = bounds(0.35, 0.35, 0.3, 0.3);
    const edge = bounds(0.01, 0.4, 0.12, 0.12);
    for (let i = 0; i < 4; i++) {
      source.emit([
        { rawPayload: 'https://example.com/center-big', displayBounds: center },
        { rawPayload: 'https://example.com/edge', displayBounds: edge },
      ]);
    }
    expect(session.currentResult?.rawPayload).toBe('https://example.com/center-big');
  });

  test('ambiguous pair preserves current and exposes chooser candidates', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();
    source.emit([{ rawPayload: 'https://example.com/keep', displayBounds: bounds(0.3, 0.3, 0.15, 0.15) }]);
    source.emit([{ rawPayload: 'https://example.com/keep', displayBounds: bounds(0.3, 0.3, 0.15, 0.15) }]);
    const current = session.currentResult;
    expect(current?.rawPayload).toBe('https://example.com/keep');

    // Two equally sized symmetric codes: no dominance → keep current.
    // Emit twice so stability equalizes (first frame favors the incumbent).
    const pairLeft = { rawPayload: 'https://example.com/keep', displayBounds: bounds(0.05, 0.4, 0.15, 0.15) };
    const pairRight = { rawPayload: 'https://example.com/other', displayBounds: bounds(0.8, 0.4, 0.15, 0.15) };
    source.emit([pairLeft, pairRight]);
    source.emit([pairLeft, pairRight]);
    expect(session.currentResult).toBe(current);
    expect(session.multiCodeCandidates.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        stableCandidateId('https://example.com/keep'),
        stableCandidateId('https://example.com/other'),
      ]),
    );
    expect(session.isMultiCodeAmbiguous).toBe(true);
  });

  test('choosing a row accepts exactly that payload', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();
    source.emit([
      { rawPayload: 'https://example.com/left', displayBounds: bounds(0.05, 0.4, 0.15, 0.15) },
      { rawPayload: 'https://example.com/right', displayBounds: bounds(0.8, 0.4, 0.15, 0.15) },
    ]);
    const rightId = stableCandidateId('https://example.com/right');
    session.selectCandidate(rightId);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/right');
  });

  test('candidate updates never round-robin the current result', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();
    source.emit([{ rawPayload: 'https://example.com/a', displayBounds: bounds(0.3, 0.3, 0.15, 0.15) }]);
    source.emit([{ rawPayload: 'https://example.com/a', displayBounds: bounds(0.3, 0.3, 0.15, 0.15) }]);
    const first = session.currentResult;
    expect(first?.rawPayload).toBe('https://example.com/a');

    // Same set, reordered callback order → no change.
    const left = { rawPayload: 'https://example.com/a', displayBounds: bounds(0.05, 0.4, 0.15, 0.15) };
    const right = { rawPayload: 'https://example.com/b', displayBounds: bounds(0.8, 0.4, 0.15, 0.15) };
    source.emit([left, right]);
    const afterFirstOrder = session.currentResult;
    source.emit([right, left]);
    expect(session.currentResult).toBe(afterFirstOrder);
    // Still a, never flipped to b without dominance.
    expect(session.currentResult?.rawPayload).toBe('https://example.com/a');
  });

  test('manual choice sticks across ambiguous updates', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();
    source.emit([
      { rawPayload: 'https://example.com/a', displayBounds: bounds(0.05, 0.4, 0.15, 0.15) },
      { rawPayload: 'https://example.com/b', displayBounds: bounds(0.8, 0.4, 0.15, 0.15) },
    ]);
    session.selectCandidate(stableCandidateId('https://example.com/b'));
    expect(session.currentResult?.rawPayload).toBe('https://example.com/b');
    // Ambiguous movement must not flip back.
    source.emit([
      { rawPayload: 'https://example.com/b', displayBounds: bounds(0.8, 0.4, 0.15, 0.15) },
      { rawPayload: 'https://example.com/a', displayBounds: bounds(0.05, 0.4, 0.15, 0.15) },
    ]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/b');
  });
});
