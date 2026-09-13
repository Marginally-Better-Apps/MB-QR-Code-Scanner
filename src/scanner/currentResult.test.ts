import { AUTH_QR_FIXTURES } from '@/scanner/authQr';
import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { ScannerObservationFixtureSource } from '@/scanner/fixtures';
import { ScannerSessionStore } from '@/scanner/session';

function detection(rawPayload: string) {
  return {
    rawPayload,
    displayBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  };
}

function makeSession(engineID = 'fixture.sticky') {
  const source = new ScannerObservationFixtureSource({ engineID });
  const session = new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: source,
  });
  return { source, session };
}

describe('sticky session current result (SCN-04)', () => {
  test('cold launch begins with no current result', () => {
    const { session } = makeSession();
    expect(session.currentResult).toBeNull();
  });

  test('first accepted event becomes current', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/first')]);

    expect(session.currentResult?.rawPayload).toBe('https://example.com/first');
  });

  test('removal or empty frame never clears the accessory', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/keep')]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/keep');

    source.emit([]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/keep');
    expect(session.visibleObservations).toEqual([]);
  });

  test('same payload continuously visible does not replace the current result', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/same')]);
    const first = session.currentResult;
    expect(first?.rawPayload).toBe('https://example.com/same');

    source.emit([detection('https://example.com/same')]);
    expect(session.currentResult).toBe(first);
  });

  test('different accepted payload replaces with one transition', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/a')]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/a');

    let emissions = 0;
    const unsubscribe = session.subscribe(() => {
      emissions += 1;
    });
    try {
      source.emit([detection('https://example.com/b')]);
    } finally {
      unsubscribe();
    }

    expect(session.currentResult?.rawPayload).toBe('https://example.com/b');
    expect(emissions).toBe(1);
  });

  test('current result survives tab obscured/visible transitions', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/persist')]);
    session.handlePresentation('obscured');
    expect(session.currentResult?.rawPayload).toBe('https://example.com/persist');
    session.handlePresentation('visible');
    expect(session.currentResult?.rawPayload).toBe('https://example.com/persist');
  });

  test('current result survives background and inactive resume while process alive', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/persist')]);

    session.handleLifecycle('background');
    expect(session.currentResult?.rawPayload).toBe('https://example.com/persist');

    session.handleLifecycle('active');
    expect(session.currentResult?.rawPayload).toBe('https://example.com/persist');

    session.handleLifecycle('inactive');
    expect(session.currentResult?.rawPayload).toBe('https://example.com/persist');

    session.handleLifecycle('active');
    expect(session.currentResult?.rawPayload).toBe('https://example.com/persist');
  });

  test('background and inactive drop session-only authentication results', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection(AUTH_QR_FIXTURES.otpauthTotp)]);
    expect(session.currentResult?.rawPayload).toBe(AUTH_QR_FIXTURES.otpauthTotp);

    session.handleLifecycle('background');
    expect(session.currentResult).toBeNull();

    source.emit([detection(AUTH_QR_FIXTURES.fidoHybrid)]);
    expect(session.currentResult?.rawPayload).toBe(AUTH_QR_FIXTURES.fidoHybrid);
    session.handleLifecycle('inactive');
    expect(session.currentResult).toBeNull();
  });

  test('clear removes only the current result and returns to empty', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/clear-me')]);
    expect(session.currentResult).not.toBeNull();

    session.clearCurrentResult();

    expect(session.currentResult).toBeNull();
  });

  test('after clear the next accepted event becomes current again', async () => {
    const { source, session } = makeSession();
    await session.activateScanner();

    source.emit([detection('https://example.com/one')]);
    session.clearCurrentResult();
    expect(session.currentResult).toBeNull();

    source.emit([detection('https://example.com/two')]);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/two');
  });
});
