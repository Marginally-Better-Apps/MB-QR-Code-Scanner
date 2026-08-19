import { Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { GlassControl } from '@/components/GlassControl';
import { ObservationResultBar } from '@/components/ObservationResultBar';
import { ScannerPreview } from '@/components/ScannerPreview';
import { UnavailableState } from '@/components/UnavailableState';
import { useScannerSession } from '@/hooks/useScanner';
import { t } from '@/i18n';
import type { ScannerObservation, ScannerSessionStore } from '@/scanner';
import type { NativeEngineKind } from '@/components/ScannerPreview';

type Props = {
  session: ScannerSessionStore;
  engine: NativeEngineKind;
  onOpenHistory?: () => void;
};

export function ScannerScreen({ session, engine, onOpenHistory }: Props) {
  useScannerSession(session);
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const onMedia = session.cameraAccessState === 'ready';
  const lightChrome = !onMedia && !dark;

  let body;
  switch (session.cameraAccessState) {
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
      const isLiveCamera = !session.engineID.startsWith('fixture');
      body = (
        <View
          testID="live-scan-area"
          style={styles.fill}
          pointerEvents="box-none"
          accessibilityLabel={t('liveScanArea')}>
          {isLiveCamera ? (
            <ScannerPreview
              engine={engine}
              running={session.isCapturing}
              onReady={(ready) => session.setHasPreview(ready)}
            />
          ) : null}
          {session.visibleObservations.length > 0 ? (
            <ObservationHighlights
              observations={session.visibleObservations}
              bottomInset={insets.bottom}
            />
          ) : isLiveCamera ? null : (
            <UnavailableState title="readyToScan" description="pointCamera" />
          )}
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

function ObservationHighlights({
  observations,
  bottomInset,
}: {
  observations: ScannerObservation[];
  bottomInset: number;
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
      <View
        testID="scanner-observation-results"
        style={[styles.results, { paddingBottom: Math.max(bottomInset, 8) + 8 }]}
        pointerEvents="box-none">
        {observations.map((observation, index) => (
          <ObservationResultBar
            key={`bar-${observation.rawPayload}-${index}`}
            payload={observation.rawPayload}
          />
        ))}
      </View>
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
  results: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  historyButton: {
    position: 'absolute',
    right: 16,
    zIndex: 3,
  },
});
