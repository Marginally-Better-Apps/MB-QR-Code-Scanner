import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { GlassControl } from '@/components/GlassControl';
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
  const dark = useColorScheme() === 'dark';

  return (
    <View style={styles.container} testID="unavailable-state">
      <Text style={[styles.title, dark && styles.lightText]}>{t(title)}</Text>
      <Text style={[styles.description, dark && styles.lightText]}>{t(description)}</Text>
      {actionTitle && onAction ? (
        <GlassControl
          accessibilityLabel={t(actionTitle)}
          testID={actionTestID ?? 'unavailable-action'}
          onPress={onAction}
          shape="pill"
          tone={dark ? 'onMedia' : 'onCanvas'}
          style={styles.action}>
          <Text style={[styles.buttonLabel, dark && styles.lightText]}>{t(actionTitle)}</Text>
        </GlassControl>
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
  lightText: {
    color: '#fff',
  },
  action: {
    marginTop: 8,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
