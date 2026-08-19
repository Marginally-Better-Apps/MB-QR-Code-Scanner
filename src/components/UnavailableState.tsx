import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type MessageKey } from '@/i18n';

type Props = {
  title: MessageKey;
  description: MessageKey;
  systemImage?: string;
  actionTitle?: MessageKey;
  onAction?: () => void;
  actionTestID?: string;
};

export function UnavailableState({
  title,
  description,
  actionTitle,
  onAction,
  actionTestID,
}: Props) {
  return (
    <View style={styles.container} testID="unavailable-state">
      <Text style={styles.title}>{t(title)}</Text>
      <Text style={styles.description}>{t(description)}</Text>
      {actionTitle && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(actionTitle)}
          testID={actionTestID}
          onPress={onAction}
          style={styles.button}>
          <Text style={styles.buttonLabel}>{t(actionTitle)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.7,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
