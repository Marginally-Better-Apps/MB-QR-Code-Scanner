import { StyleSheet, View } from 'react-native';

import { COMPACT_GUIDE_SIZE } from '@/components/adaptiveLayout';

type Props = {
  highContrast?: boolean;
  /** Outer guide box size in points. Capped by adaptive layout for iPad. */
  guideSize?: number;
};

export const CENTER_SCAN_GUIDE_SIZE = COMPACT_GUIDE_SIZE;
export const CENTER_SCAN_CORNER_LENGTH = 36;

export function ScanTargetGuide({
  highContrast = false,
  guideSize = CENTER_SCAN_GUIDE_SIZE,
}: Props) {
  const borderWidth = highContrast ? 5 : 3;
  const borderColor = highContrast ? '#ffffff' : 'rgba(255,255,255,0.92)';
  const size = Math.min(240, Math.max(160, guideSize));

  const baseCorner = {
    borderColor,
    borderWidth,
    shadowColor: '#000000',
    shadowOpacity: highContrast ? 0.9 : 0.6,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  };

  return (
    <View
      testID="center-scan-guide"
      accessible={false}
      pointerEvents="box-none"
      style={styles.container}>
      <View
        accessible={false}
        pointerEvents="none"
        testID="center-scan-guide-box"
        style={[styles.box, { width: size, height: size }]}>
        <View
          testID="center-scan-corner-tl"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.corner, baseCorner, styles.topLeft]}
        />
        <View
          testID="center-scan-corner-tr"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.corner, baseCorner, styles.topRight]}
        />
        <View
          testID="center-scan-corner-bl"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.corner, baseCorner, styles.bottomLeft]}
        />
        <View
          testID="center-scan-corner-br"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.corner, baseCorner, styles.bottomRight]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  box: {
    width: CENTER_SCAN_GUIDE_SIZE,
    height: CENTER_SCAN_GUIDE_SIZE,
  },
  corner: {
    position: 'absolute',
    width: CENTER_SCAN_CORNER_LENGTH,
    height: CENTER_SCAN_CORNER_LENGTH,
    backgroundColor: 'transparent',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
});
