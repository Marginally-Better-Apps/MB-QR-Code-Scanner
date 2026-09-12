import type { ParsedQRPayload, QRAction } from './payloadParser';

export type ResultActionDeps = {
  openURL: (url: string) => Promise<unknown> | unknown;
  copyText: (text: string) => Promise<unknown> | unknown;
  shareText: (text: string) => Promise<unknown> | unknown;
};

/**
 * Explicit ActionRouter for scan results (ACT-02).
 *
 * System routing (openURL) happens only when the caller explicitly dispatches
 * an open action from a tap handler. Importing or rendering never opens,
 * copies, shares, or fetches anything.
 */
export async function dispatchResultAction(
  parsed: ParsedQRPayload,
  action: QRAction,
  deps: ResultActionDeps,
): Promise<void> {
  switch (action) {
    case 'openUrl': {
      if (parsed.content.kind !== 'url') {
        throw new Error('openUrl requires a parsed web URL result');
      }
      const url = parsed.content.url;
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('openUrl refuses non-http(s) destinations');
      }
      await deps.openURL(url);
      return;
    }
    case 'openApp': {
      if (parsed.content.kind !== 'customScheme') {
        throw new Error('openApp requires a custom-scheme result');
      }
      const raw = parsed.originalPayload.trim();
      if (raw.length === 0) {
        throw new Error('openApp requires a non-empty destination');
      }
      await deps.openURL(raw);
      return;
    }
    case 'copy': {
      await deps.copyText(parsed.originalPayload);
      return;
    }
    case 'share': {
      await deps.shareText(parsed.originalPayload);
      return;
    }
    case 'authenticate': {
      throw new Error('Action "authenticate" is not implemented');
    }
    default: {
      throw new Error(`Action "${action as string}" is not handled by the web/text router`);
    }
  }
}

export function defaultResultActionDeps(): ResultActionDeps {
  // Lazy requires keep unit tests free of react-native side effects.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Linking, Share } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clipboard = require('expo-clipboard');
  return {
    openURL: (url: string) => Linking.openURL(url),
    copyText: (text: string) => Clipboard.setStringAsync(text),
    shareText: (text: string) => Share.share({ message: text }),
  };
}
