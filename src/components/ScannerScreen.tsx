import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { GlassControl } from '@/components/GlassControl';
import { ScannerPreview } from '@/components/ScannerPreview';
import { ScanTargetGuide } from '@/components/ScanTargetGuide';
import { StickyResultBar } from '@/components/StickyResultBar';
import { UnavailableState } from '@/components/UnavailableState';
import { useScannerSession } from '@/hooks/useScanner';
import { t } from '@/i18n';
import type { ScannerObservation, ScannerSessionStore } from '@/scanner';
import type { NativeEngineKind } from '@/components/ScannerPreview';

type Props = {
  session: ScannerSessionStore;
  engine: NativeEngineKind;
  nativeImageFixture?: string;
  onOpenHistory?: () => void;
};

export function ScannerScreen({
  session,
  engine,
  nativeImageFixture,
  onOpenHistory,
}: Props) {
  const scanner = useScannerSession(session);
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const highContrast = useHighContrast();
  const onMedia = scanner.cameraAccessState === 'ready';
  const lightChrome = !onMedia && !dark;
  const isLiveForGuide =
    scanner.cameraAccessState === 'ready' &&
    !scanner.engineID.startsWith('fixture');
  const [coachingExpired, setCoachingExpired] = useState(false);

  useEffect(() => {
    if (!isLiveForGuide || scanner.hasAcceptedScan) {
      return;
    }
    const id = setTimeout(
      () => setCoachingExpired(true),
      SCAN_TARGET_COACHING_TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [isLiveForGuide, scanner.hasAcceptedScan]);

  const showCoaching = !scanner.hasAcceptedScan && !coachingExpired;

  let body;
  switch (scanner.cameraAccessState) {
    case 'notDetermined':
      body = <UnavailableState title="cameraAccess" description="cameraPurpose" />;
      break;
    case 'denied':
      body = (
        <UnavailableState
          title="cameraAccessIsOff"
          description="allowCameraInSettings"
          actionTitle="openSettings"
          actionTestID="camera-primary-action"
          onAction={() => {
            void Linking.openSettings();
          }}
        />
      );
      break;
    case 'restricted':
      body = (
        <UnavailableState
          title="cameraAccessIsRestricted"
          description="cameraAccessRestrictedDescription"
        />
      );
      break;
    case 'hardwareUnavailable':
      body = (
        <UnavailableState
          title="cameraUnavailable"
          description="noCameraAvailable"
        />
      );
      break;
    case 'ready': {
      const isLiveCamera = !scanner.engineID.startsWith('fixture');
      const sticky = scanner.currentResult;
      body = (
        <View
          testID="live-scan-area"
          style={styles.fill}
          pointerEvents="box-none"
          accessibilityLabel={t('liveScanArea')}>
          {isLiveCamera ? (
            <ScannerPreview
              engine={engine}
              running={scanner.isCapturing}
              imageFixture={nativeImageFixture}
              onReady={(ready) => session.setHasPreview(ready)}
            />
          ) : null}
          {isLiveCamera ? (
            <ScanTargetGuide
              showCoaching={showCoaching}
              highContrast={highContrast}
            />
          ) : null}
          {scanner.visibleObservations.length > 0 ? (
            <ObservationHighlights observations={scanner.visibleObservations} />
          ) : isLiveCamera ? null : sticky ? null : (
            <UnavailableState title="readyToScan" description="pointCamera" />
          )}
          {sticky ? (
            <View
              testID="sticky-result-container"
              style={[styles.stickyResults, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}
              pointerEvents="box-none">
              <StickyResultBar
                key="sticky-current-result"
                payload={sticky.rawPayload}
                onClear={() => session.clearCurrentResult()}
              />
            </View>
          ) : null}
        </View>
      );
      break;
    }
  }

  return (
    <View style={[styles.fill, lightChrome && styles.canvasFill]}>
      {body}
      <GlassControl
        accessibilityLabel={t('history')}
        testID="open-history"
        onPress={() => onOpenHistory?.()}
        tone={onMedia || dark ? 'onMedia' : 'onCanvas'}
        style={[styles.historyButton, { top: insets.top + 8 }]}>
        <SymbolView
          name="clock"
          size={20}
          tintColor={onMedia || dark ? '#fff' : '#000'}
          pointerEvents="none"
        />
      </GlassControl>
    </View>
  );
}

export const SCAN_TARGET_COACHING_TIMEOUT_MS = 12000;

function useHighContrast(): boolean {
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    let mounted = true;
    try {
      const query = AccessibilityInfo.isDarkerSystemColorsEnabled?.();
      if (query && typeof query.then === 'function') {
        query
          .then((enabled) => {
            if (mounted) {
              setHighContrast(enabled === true);
            }
          })
          .catch(() => {});
      }
    } catch {
      // Keep the default non-high-contrast guide.
    }
    const subscription = (() => {
      try {
        return AccessibilityInfo.addEventListener?.(
          'darkerSystemColorsChanged',
          setHighContrast,
        );
      } catch {
        return undefined;
      }
    })();
    return () => {
      mounted = false;
      try {
        subscription?.remove?.();
      } catch {
        // Ignore cleanup errors in tests.
      }
    };
  }, []);

  return highContrast;
}

function ObservationHighlights({
  observations,
}: {
  observations: ScannerObservation[];
}) {
  return (
    <View
      testID="scanner-observation-overlay"
      style={styles.overlay}
      pointerEvents="box-none">
      {observations.map((observation, index) => (
        <View
          key={`${observation.rawPayload}-${index}`}
          testID="scanner-observation-bounds"
          pointerEvents="none"
          style={[
            styles.bounds,
            {
              left: `${observation.displayBounds.x * 100}%`,
              top: `${observation.displayBounds.y * 100}%`,
              width: `${observation.displayBounds.width * 100}%`,
              height: `${observation.displayBounds.height * 100}%`,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  canvasFill: {
    backgroundColor: '#fff',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    justifyContent: 'flex-end',
  },
  bounds: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFE500',
  },
  stickyResults: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 2,
  },
  historyButton: {
    position: 'absolute',
    right: 16,
    zIndex: 3,
  },
});
