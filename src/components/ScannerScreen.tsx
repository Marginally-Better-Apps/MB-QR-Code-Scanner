import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { announceAcceptedScan } from '@/a11y/announceAcceptedScan';
import {
  chromeContainerStyle,
  resolveChromeSurface,
  useChromePreferences,
} from '@/components/chromeAppearance';
import { GlassControl } from '@/components/GlassControl';
import { MultiCodeChooser } from '@/components/MultiCodeChooser';
import { ScannerPreview } from '@/components/ScannerPreview';
import { ScanTargetGuide } from '@/components/ScanTargetGuide';
import { StickyResultBar } from '@/components/StickyResultBar';
import { UnavailableState } from '@/components/UnavailableState';
import { useScannerSession } from '@/hooks/useScanner';
import { t } from '@/i18n';
import { stableCandidateId } from '@/scanner/multiCode';
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
  const chromePrefs = useChromePreferences();
  const highContrast = chromePrefs.increaseContrast;
  const mediaChrome = resolveChromeSurface({
    ...chromePrefs,
    tone: 'onMedia',
    liquidGlassAvailable: isGlassEffectAPIAvailable() && isLiquidGlassAvailable(),
  });
  const mediaChromeGlass = mediaChrome.kind === 'liquidGlass';
  const onMedia = scanner.cameraAccessState === 'ready';
  const lightChrome = !onMedia && !dark;
  const isLiveForGuide =
    scanner.cameraAccessState === 'ready' &&
    !scanner.engineID.startsWith('fixture');
  const [coachingExpired, setCoachingExpired] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);

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

  const stickyPayload = scanner.currentResult?.rawPayload ?? null;
  useEffect(() => {
    if (stickyPayload == null) {
      return;
    }
    announceAcceptedScan(stickyPayload);
  }, [stickyPayload]);

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
      const candidates = scanner.multiCodeCandidates;
      const showChooserTrigger = candidates.length >= 2;
      const chooserLabel = `${candidates.length} ${t('codesFoundChoose')}`;
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
          ) : isLiveCamera ? null : sticky || showChooserTrigger ? null : (
            <UnavailableState title="readyToScan" description="pointCamera" />
          )}
          {sticky || showChooserTrigger ? (
            <View
              testID="sticky-result-container"
              style={[styles.stickyResults, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}
              pointerEvents="box-none">
              {showChooserTrigger ? (
                mediaChromeGlass ? (
                  <GlassView
                    style={[styles.chooserTrigger, { marginBottom: 8 }]}
                    glassEffectStyle="regular"
                    colorScheme="dark"
                    isInteractive>
                    <Pressable
                      testID="multi-code-chooser-trigger"
                      accessibilityRole="button"
                      accessibilityLabel={chooserLabel}
                      accessibilityHint={mediaChrome.kind}
                      onPress={() => setChooserOpen((open) => !open)}
                      style={styles.chooserTriggerHit}>
                      <Text style={styles.chooserTriggerText}>{chooserLabel}</Text>
                    </Pressable>
                  </GlassView>
                ) : (
                  <Pressable
                    testID="multi-code-chooser-trigger"
                    accessibilityRole="button"
                    accessibilityLabel={chooserLabel}
                    accessibilityHint={mediaChrome.kind}
                    onPress={() => setChooserOpen((open) => !open)}
                    style={[
                      styles.chooserTrigger,
                      chromeContainerStyle(mediaChrome),
                    ]}>
                    <Text style={styles.chooserTriggerText}>{chooserLabel}</Text>
                  </Pressable>
                )
              ) : null}
              {showChooserTrigger && chooserOpen ? (
                <MultiCodeChooser
                  candidates={candidates}
                  onSelect={(id) => session.selectCandidate(id)}
                />
              ) : null}
              {sticky ? (
                <StickyResultBar
                  key="sticky-current-result"
                  payload={sticky.rawPayload}
                  onClear={() => session.clearCurrentResult()}
                />
              ) : null}
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

function ObservationHighlights({
  observations,
}: {
  observations: ScannerObservation[];
}) {
  return (
    <View
      testID="scanner-observation-overlay"
      style={styles.overlay}
      pointerEvents="box-none"
      accessible={false}
      importantForAccessibility="no">
      {observations.map((observation) => {
        const stableId = stableCandidateId(observation.rawPayload);
        return (
          <View
            key={stableId}
            testID="scanner-observation-bounds"
            nativeID={stableId}
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no"
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
        );
      })}
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
  chooserTrigger: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  chooserTriggerHit: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chooserTriggerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  historyButton: {
    position: 'absolute',
    right: 16,
    zIndex: 3,
  },
});
