import { Linking, StyleSheet, View } from 'react-native';

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
};

export function ScannerScreen({ session, engine }: Props) {
  useScannerSession(session);

  switch (session.cameraAccessState) {
    case 'notDetermined':
      return (
        <UnavailableState title="cameraAccess" description="cameraPurpose" />
      );
    case 'denied':
      return (
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
    case 'restricted':
      return (
        <UnavailableState
          title="cameraAccessIsRestricted"
          description="cameraAccessRestrictedDescription"
        />
      );
    case 'hardwareUnavailable':
      return (
        <UnavailableState
          title="cameraUnavailable"
          description="noCameraAvailable"
        />
      );
    case 'ready':
      break;
  }

  const isLiveCamera = !session.engineID.startsWith('fixture');

  return (
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
        <ObservationHighlights observations={session.visibleObservations} />
      ) : isLiveCamera ? null : (
        <UnavailableState title="readyToScan" description="pointCamera" />
      )}
    </View>
  );
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
      <View style={styles.results} pointerEvents="box-none">
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
    paddingVertical: 8,
    gap: 8,
  },
});
