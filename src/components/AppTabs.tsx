import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { t } from '@/i18n';

export function AppTabs() {
  return (
    <NativeTabs minimizeBehavior="never">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('scanner')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="qrcode.viewfinder" renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>{t('history')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock" renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
