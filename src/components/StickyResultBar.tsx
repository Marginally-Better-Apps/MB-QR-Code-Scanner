import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  chromeContainerStyle,
  resolveChromeSurface,
  useChromePreferences,
} from '@/components/chromeAppearance';
import { t, type MessageKey } from '@/i18n';
import {
  defaultResultActionDeps,
  dispatchResultAction,
  resolvePrimarySystemAction,
  type ResultActionCapabilities,
  type ResultActionDeps,
} from '@/scanner/actionRouter';
import { recognizeAuthQr } from '@/scanner/authQr';
import { parseQRPayload } from '@/scanner/payloadParser';
import { describeResultForDisplay } from '@/scanner/webTextPresentation';

type Props = {
  payload: string;
  onClear: () => void;
  actionDeps?: ResultActionDeps;
  actionCapabilities?: Partial<ResultActionCapabilities>;
};

const PRIMARY_LABEL: Record<
  NonNullable<ReturnType<typeof resolvePrimarySystemAction>>['action'],
  MessageKey
> = {
  openUrl: 'openLink',
  openApp: 'openAppLink',
  composeEmail: 'composeEmail',
  call: 'call',
  sendSms: 'sendSms',
  openLocation: 'openMap',
  addContact: 'addContact',
  addEvent: 'addEvent',
  joinWifi: 'joinWifi',
  openAuth: 'openPasswords',
};

const PRIMARY_SYMBOL = {
  openUrl: 'arrow.up.right.square',
  openApp: 'arrow.up.right.square',
  composeEmail: 'envelope',
  call: 'phone',
  sendSms: 'message',
  openLocation: 'map',
  addContact: 'person.crop.circle.badge.plus',
  addEvent: 'calendar.badge.plus',
  joinWifi: 'wifi',
  openAuth: 'lock.shield',
} as const;

export function StickyResultBar({
  payload,
  onClear,
  actionDeps,
  actionCapabilities,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const prefs = useChromePreferences();
  const surface = resolveChromeSurface({
    ...prefs,
    tone: 'onMedia',
    liquidGlassAvailable: isGlassEffectAPIAvailable() && isLiquidGlassAvailable(),
  });
  const glass = surface.kind === 'liquidGlass';

  const parsed = useMemo(() => parseQRPayload(payload), [payload]);
  const [customAppName, setCustomAppName] = useState<string | null>(null);
  const [customAvailable, setCustomAvailable] = useState<boolean | null>(null);
  const deps = useMemo(() => {
    const base = actionDeps ?? defaultResultActionDeps();
    if (!actionCapabilities) {
      return base;
    }
    return {
      ...base,
      capabilities: { ...base.capabilities, ...actionCapabilities },
    };
  }, [actionDeps, actionCapabilities]);
  const resolvedPrimary = useMemo(
    () => resolvePrimarySystemAction(parsed, deps.capabilities),
    [parsed, deps.capabilities],
  );
  useEffect(() => {
    let cancelled = false;
    if (resolvedPrimary?.action !== 'openApp') {
      setCustomAppName(null);
      setCustomAvailable(null);
      return;
    }
    const url = resolvedPrimary.url;
    const nameCheck = deps.getAppNameForURL
      ? Promise.resolve(deps.getAppNameForURL(url))
      : Promise.resolve(null);
    void nameCheck.then((name) => {
      if (!cancelled && typeof name === 'string' && name.trim().length > 0) {
        setCustomAppName(name.trim());
      } else if (!cancelled) {
        setCustomAppName(null);
      }
    });
    const availabilityCheck = deps.canOpenURL
      ? Promise.resolve(deps.canOpenURL(url))
      : Promise.resolve(true);
    void availabilityCheck.then((allowed) => {
      if (!cancelled) {
        setCustomAvailable(allowed === true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deps, resolvedPrimary]);
  const view = useMemo(
    () => describeResultForDisplay(parsed, { appName: customAppName }),
    [parsed, customAppName],
  );
  const authFormat = useMemo(() => recognizeAuthQr(payload)?.format ?? null, [payload]);
  const secretSession = parsed.sensitivity === 'sessionOnly';
  const [authOpenable, setAuthOpenable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (resolvedPrimary?.action !== 'openAuth') {
      setAuthOpenable(null);
      return;
    }
    const check = deps.canOpenURL
      ? Promise.resolve(deps.canOpenURL(resolvedPrimary.url))
      : Promise.resolve(false);
    void check.then((allowed) => {
      if (!cancelled) {
        setAuthOpenable(allowed === true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deps, resolvedPrimary]);

  const authPending = resolvedPrimary?.action === 'openAuth' && authOpenable === null;
  const customUnavailable =
    resolvedPrimary?.action === 'openApp' && customAvailable === false;
  const primary =
    resolvedPrimary?.action === 'openAuth' && authOpenable !== true
      ? null
      : resolvedPrimary?.action === 'openApp' && customUnavailable
        ? null
        : resolvedPrimary;
  const openLabel = primary
    ? primary.action === 'openAuth' && authFormat === 'fido-hybrid'
      ? t('connectNearby')
      : primary.action === 'openApp' && customAppName
        ? t('openInApp', { app: customAppName })
        : t(PRIMARY_LABEL[primary.action])
    : '';

  async function handleOpen() {
    if (!primary) {
      return;
    }
    await dispatchResultAction(parsed, primary.action, deps);
  }

  async function handleCopy() {
    await dispatchResultAction(parsed, 'copy', deps);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }

  async function handleShare() {
    await dispatchResultAction(parsed, 'share', deps);
  }

  const visibleWebUrl =
    view.kind === 'web'
      ? `${view.fullDestination.toLowerCase().startsWith('http://') ? 'http://' : 'https://'}${view.host}${view.pathPreview}`
      : null;

  const preview =
    view.kind === 'web' ? (
      <View style={styles.preview}>
        <Text
          testID="sticky-result-url"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.url}
          maxFontSizeMultiplier={2.2}>
          {visibleWebUrl}
        </Text>
        {/* Back-compat single-line payload for existing sticky-session tests.
            Safe truncated destination; equals the raw payload for ordinary URLs. */}
        <Text
          testID="sticky-result-payload"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.fullDestination}
        </Text>
      </View>
    ) : view.kind === 'custom' ? (
      <View style={styles.preview}>
        <Text
          testID="sticky-result-scheme"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.scheme}
          maxFontSizeMultiplier={2.2}>
          {view.scheme}
        </Text>
        <Text
          testID="sticky-result-custom-remainder"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.path}
          maxFontSizeMultiplier={2.2}>
          {view.remainderPreview}
        </Text>
        {view.appName ? (
          <Text
            testID="sticky-result-app-name"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={styles.path}
            maxFontSizeMultiplier={2.2}>
            {view.appName}
          </Text>
        ) : null}
        {view.isPayment ? (
          <Text
            testID="sticky-result-payment-note"
            numberOfLines={2}
            style={styles.path}
            maxFontSizeMultiplier={2.2}>
            {t('paymentUnverified')}
          </Text>
        ) : null}
        {customUnavailable ? (
          <Text
            testID="sticky-result-app-unavailable"
            numberOfLines={2}
            style={styles.path}
            maxFontSizeMultiplier={2.2}>
            {t('customAppUnavailable')}
          </Text>
        ) : null}
        <Text
          testID="sticky-result-payload"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'email' ? (
      <View style={styles.preview}>
        <Text testID="sticky-result-email-to" numberOfLines={1} style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {`${t('emailTo')} ${view.to}`}
        </Text>
        {view.subject.length > 0 ? (
          <Text testID="sticky-result-email-subject" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {`${t('emailSubject')} ${view.subject}`}
          </Text>
        ) : null}
        {view.body.length > 0 ? (
          <Text testID="sticky-result-email-body" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {`${t('emailBody')} ${view.body}`}
          </Text>
        ) : null}
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'phone' ? (
      <View style={styles.preview}>
        <Text testID="sticky-result-phone" numberOfLines={1} style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {view.displayNumber}
        </Text>
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'sms' ? (
      <View style={styles.preview}>
        <Text testID="sticky-result-sms-number" numberOfLines={1} style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {view.displayNumber}
        </Text>
        {view.message.length > 0 ? (
          <Text testID="sticky-result-sms-body" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.message}
          </Text>
        ) : null}
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'geo' ? (
      <View style={styles.preview}>
        <Text testID="sticky-result-geo-coords" numberOfLines={1} style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {`${view.latitude}, ${view.longitude}`}
        </Text>
        {view.query ? (
          <Text testID="sticky-result-geo-query" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.query}
          </Text>
        ) : null}
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'contact' ? (
      <View style={styles.preview}>
        <Text testID="sticky-result-contact-name" numberOfLines={1} style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {view.name ?? t('contactUntitled')}
        </Text>
        {view.organization ? (
          <Text testID="sticky-result-contact-org" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.organization}
          </Text>
        ) : null}
        {view.phones[0] ? (
          <Text testID="sticky-result-contact-phone" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.phones[0]}
          </Text>
        ) : null}
        {view.emails[0] ? (
          <Text testID="sticky-result-contact-email" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.emails[0]}
          </Text>
        ) : null}
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'calendar' ? (
      <View style={styles.preview}>
        <Text testID="sticky-result-event-title" numberOfLines={1} style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {view.title}
        </Text>
        <Text testID="sticky-result-event-when" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
          {view.whenLabel}
        </Text>
        {view.location ? (
          <Text testID="sticky-result-event-location" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.location}
          </Text>
        ) : null}
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : view.kind === 'wifi' ? (
      <View style={styles.preview}>
        <Text
          testID="sticky-result-wifi-ssid"
          accessibilityLabel={`${t('wifiNetwork')} ${view.ssid}`}
          numberOfLines={1}
          style={styles.host}
          maxFontSizeMultiplier={2.2}>
          {view.ssid}
        </Text>
        <Text testID="sticky-result-wifi-security" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
          {view.security}
        </Text>
        {view.passwordMasked ? (
          <Text
            testID="sticky-result-wifi-password"
            accessibilityLabel={t('wifiPasswordHidden')}
            numberOfLines={1}
            style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {view.passwordMasked}
          </Text>
        ) : null}
        {!primary ? (
          <Text testID="sticky-result-wifi-unavailable" numberOfLines={1} style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {t('wifiJoinUnavailable')}
          </Text>
        ) : null}
        <Text testID="sticky-result-payload" numberOfLines={1} style={styles.compatPayload}
          accessible={false}
          importantForAccessibility="no">
          {view.full}
        </Text>
      </View>
    ) : (
      <View style={styles.preview}>
        <Text
          testID="sticky-result-payload"
          numberOfLines={expanded ? undefined : 1}
          ellipsizeMode="middle"
          style={styles.payload}
          maxFontSizeMultiplier={2.2}>
          {view.kind === 'text' ? view.preview : view.preview}
        </Text>
        {authFormat === 'otpauth-migration' ? (
          <Text testID="sticky-result-auth-note" style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {t('authMigrationUnsupported')}
          </Text>
        ) : null}
        {authFormat === 'fido-hybrid' && !authPending ? (
          <Text testID="sticky-result-auth-note" style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {primary ? t('authFidoConfirm') : t('authFidoUnavailable')}
          </Text>
        ) : null}
        {authFormat === 'otpauth' && !primary && !authPending ? (
          <Text testID="sticky-result-auth-note" style={styles.path}
          maxFontSizeMultiplier={2.2}>
            {t('authOtpUnavailable')}
          </Text>
        ) : null}
      </View>
    );

  const fullText =
    view.kind === 'web'
      ? view.fullDestination
      : view.full;

  const body = (
    <View accessible={false}>
      <View style={styles.actionsRow} testID="sticky-result-actions">
        <View style={styles.previewContainer}>{preview}</View>
        {primary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={openLabel}
            testID="sticky-result-open"
            onPress={() => {
              void handleOpen();
            }}
            style={styles.iconButton}
            hitSlop={8}>
            <SymbolView
              name={PRIMARY_SYMBOL[primary.action]}
              size={18}
              tintColor={surface.contentColor}
              pointerEvents="none"
            />
          </Pressable>
        ) : null}
        {secretSession ? null : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('copy')}
              testID="sticky-result-copy"
              onPress={() => {
                void handleCopy();
              }}
              style={styles.iconButton}
              hitSlop={8}>
              <SymbolView
                name={didCopy ? 'checkmark' : 'doc.on.clipboard'}
                size={18}
                tintColor={surface.contentColor}
                pointerEvents="none"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('share')}
              testID="sticky-result-share"
              onPress={() => {
                void handleShare();
              }}
              style={styles.iconButton}
              hitSlop={8}>
              <SymbolView
                name="square.and.arrow.up"
                size={18}
                tintColor={surface.contentColor}
                pointerEvents="none"
              />
            </Pressable>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('hideDetails') : t('showDetails')}
          testID="sticky-result-expand"
          onPress={() => setExpanded((value) => !value)}
          style={styles.iconButton}
          hitSlop={8}>
          <SymbolView
            name={expanded ? 'chevron.down' : 'chevron.up'}
            size={18}
            tintColor={surface.contentColor}
            pointerEvents="none"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clear')}
          testID="sticky-result-clear"
          onPress={onClear}
          style={styles.iconButton}
          hitSlop={8}>
          <SymbolView
            name="xmark"
            size={18}
            tintColor={surface.contentColor}
            pointerEvents="none"
          />
        </Pressable>
      </View>
      {expanded ? (
        <View testID="sticky-result-detail" style={styles.detail}>
          <Text
            testID="sticky-result-full-payload"
            selectable
            style={styles.detailText}
          maxFontSizeMultiplier={2.2}>
            {fullText}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (glass) {
    return (
      <GlassView
        testID="sticky-result-accessory"
        accessibilityLabel={t('scanResult')}
        accessibilityActions={[{ name: 'escape', label: t('clear') }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'escape') {
            onClear();
          }
        }}
        style={styles.bar}
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive>
        <View
          testID={`chrome-surface-${surface.kind}`}
          accessible={false}
          importantForAccessibility="no"
          style={styles.chromeProbe}
        />
        {body}
      </GlassView>
    );
  }

  return (
    <View
      testID="sticky-result-accessory"
      accessibilityLabel={t('scanResult')}
      accessibilityActions={[{ name: 'escape', label: t('clear') }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'escape') {
          onClear();
        }
      }}
      style={[styles.bar, chromeContainerStyle(surface)]}>
      <View
        testID={`chrome-surface-${surface.kind}`}
        accessible={false}
        importantForAccessibility="no"
        style={styles.chromeProbe}
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 44,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  chromeProbe: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsRow: {
    minHeight: 44,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  previewContainer: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '40%',
    minWidth: 120,
    paddingLeft: 14,
    paddingRight: 8,
    justifyContent: 'center',
  },
  preview: {
    flex: 1,
    justifyContent: 'center',
  },
  payload: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  url: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  host: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  path: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  scheme: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD60A',
  },
  compatPayload: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
    overflow: 'hidden',
  },
  iconButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 14,
    paddingRight: 4,
    paddingBottom: 8,
    gap: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    paddingTop: 2,
  },
});
