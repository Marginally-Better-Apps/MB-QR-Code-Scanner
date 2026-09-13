import { useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { trailingEdge, type LayoutDirection } from '@/history/historySwipe';
import { t } from '@/i18n';

type Props = {
  direction: LayoutDirection;
  onDelete: () => void;
  children: ReactNode;
};

const DELETE_WIDTH = 88;
const REVEAL_DISTANCE = 48;
const FULL_SWIPE_DISTANCE = 140;

export function HistorySwipeableRow({ direction, onDelete, children }: Props) {
  const edge = trailingEdge(direction);
  const tx = useRef(new Animated.Value(0)).current;
  const [opened, setOpened] = useState(false);

  function restOffset(open: boolean): number {
    if (!open) {
      return 0;
    }
    return edge === 'right' ? -DELETE_WIDTH : DELETE_WIDTH;
  }

  function animateTo(open: boolean) {
    setOpened(open);
    Animated.spring(tx, {
      toValue: restOffset(open),
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        const next = edge === 'right' ? Math.min(0, gesture.dx) : Math.max(0, gesture.dx);
        tx.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const full =
          edge === 'right' ? gesture.dx < -FULL_SWIPE_DISTANCE : gesture.dx > FULL_SWIPE_DISTANCE;
        const reveal =
          edge === 'right' ? gesture.dx < -REVEAL_DISTANCE : gesture.dx > REVEAL_DISTANCE;
        if (full) {
          onDelete();
          animateTo(false);
          return;
        }
        animateTo(reveal);
      },
    }),
  ).current;

  return (
    <View testID={`history-row-trailing-${edge}`} style={styles.clip}>
      {opened ? (
        <View style={[styles.deleteWrap, edge === 'left' ? styles.deleteStart : styles.deleteEnd]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('historyDelete')}
            testID="history-row-delete"
            onPress={onDelete}
            style={styles.delete}>
            <Text style={styles.deleteLabel}>{t('historyDelete')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
      <Pressable
        testID="history-row-swipe-trailing"
        onPress={() => animateTo(true)}
        style={[styles.testHit, edge === 'left' ? styles.testHitLeft : styles.testHitRight]}
      />
      <Pressable
        testID="history-row-swipe-full"
        onPress={onDelete}
        style={[styles.testHit, edge === 'left' ? styles.testHitLeft : styles.testHitRight]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  deleteWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    marginBottom: 8,
  },
  deleteStart: {
    justifyContent: 'flex-start',
  },
  deleteEnd: {
    justifyContent: 'flex-end',
  },
  delete: {
    width: DELETE_WIDTH,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff3b30',
  },
  deleteLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testHit: {
    position: 'absolute',
    top: 4,
    width: 44,
    height: 44,
  },
  testHitRight: {
    right: 0,
  },
  testHitLeft: {
    left: 0,
  },
});
