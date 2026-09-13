import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { trailingEdge, type LayoutDirection } from '@/history/historySwipe';
import { t } from '@/i18n';

type Props = {
  direction: LayoutDirection;
  onDelete: () => void;
  children: ReactNode;
};

export function HistorySwipeableRow({ direction, onDelete, children }: Props) {
  const edge = trailingEdge(direction);
  const deleteAction = () => (
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
  );

  return (
    <ReanimatedSwipeable
      testID={`history-row-trailing-${edge}`}
      renderRightActions={edge === 'right' ? deleteAction : undefined}
      renderLeftActions={edge === 'left' ? deleteAction : undefined}
      onSwipeableOpen={(opened) => {
        if (opened === edge) {
          onDelete();
        }
      }}
      overshootRight={edge === 'right'}
      overshootLeft={edge === 'left'}
      childrenContainerStyle={{ direction }}>
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  deleteWrap: {
    flex: 1,
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
    width: 88,
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
});
