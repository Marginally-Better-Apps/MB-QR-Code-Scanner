import { requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { publishNativeObservations } from '@/scanner/nativeSource';
import type { Rect } from '@/scanner';

export type NativeEngineKind = 'visionkit' | 'avfoundation';

type NativeObservation = {
  payload: string | null;
  displayBounds: Rect;
};

type Props = {
  engine: NativeEngineKind;
  running: boolean;
  onReady?: (ready: boolean) => void;
};

type NativeProps = ViewProps & {
  engine: NativeEngineKind;
  running: boolean;
  style?: StyleProp<ViewStyle>;
  onObservations?: (event: { nativeEvent: { items: NativeObservation[] } }) => void;
  onPreviewReady?: (event: { nativeEvent: { ready: boolean } }) => void;
};

const NativeView = (() => {
  try {
    return requireNativeViewManager<NativeProps>('ScannerEngine');
  } catch {
    return null;
  }
})();

export function ScannerPreview({ engine, running, onReady }: Props) {
  if (!NativeView) {
    return <View style={styles.fill} />;
  }

  return (
    <NativeView
      style={styles.fill}
      engine={engine}
      running={running}
      onObservations={(event) => {
        publishNativeObservations(engine, event.nativeEvent.items);
      }}
      onPreviewReady={(event) => onReady?.(event.nativeEvent.ready)}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
});
