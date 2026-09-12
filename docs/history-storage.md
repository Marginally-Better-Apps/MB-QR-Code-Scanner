# History storage (HIS-01)

Local-only persistent scan history. There is no server, no sync, and no
 reusable-secret store.

## Where it lives

- One JSON envelope, schema v1: `{ "version": 1, "events": [...] }`
  at `Documents/history/history-v1.json` inside the app sandbox
  (see `src/history/historyExpoFileIO.ts`).
- Written with `expo-file-system` only. `src/history` contains no network
  capability (`fetch`, uploads, sharing); `scripts/test-history-storage.py`
  asserts this in CI, and `historyStore.test.ts` asserts no network call is
  made while recording or fetching.
- Corrupt files and unknown schema versions load as empty without throwing;
  the next write heals the file.

## What is stored

The sensitivity-to-storage policy is centralized in
`src/history/historyPolicy.ts`. Rows are created exclusively through
`HistoryStore.recordAccepted`, which the app invokes downstream of the scan
acceptance gate (`ScannerSessionStore.onAcceptedScan`), so observations that
never stabilize create no rows.

| Input | Stored row |
| --- | --- |
| Standard kinds (url, text, email, phone, sms, geo, contact, calendar, customScheme) | UUID, accepted date, kind, safe summary, allowed original payload, parser version |
| Wi-Fi (`redacted`) | UUID, accepted date, kind `wifi`, generic summary `Wi-Fi network`. Password and SSID are omitted by default; the original payload is never stored |
| OTP / session-only, passkey/FIDO markers, private-key material | At most a generic kind `redacted` plus the timestamp. No summary, no original, no raw secret anywhere in the row |

Unstructured text matching secret-enrollment markers (`passkey`,
`webauthn`, `fido2`, `fido:`, `otpauth://`, `otpauth-migration:`,
private-key blocks) is redacted even when it parses as another kind. The
check errs toward redaction: a page whose URL merely mentions passkeys is
stored redacted rather than risk persisting enrollment material. Exact
recognition versus invocation rules live in `docs/auth-qr-capabilities.md`.

## Platform protection

- **Local-only.** The file never leaves the sandbox through any app code
  path. Standard encrypted device backup still applies; there is no
  app-controlled sync or upload.
- **Complete file protection while locked.** The app declares
  `com.apple.developer.default-data-protection = NSFileProtectionComplete`
  in `app.json` (`expo.ios.entitlements`), so every file the app creates —
  including the history envelope — uses the Complete protection class.
  Verified by generating the native project (`npx expo prebuild --platform
  ios`) and confirming the key in `ios/QRScanner/QRScanner.entitlements`;
  `scripts/test-history-storage.py` pins the entitlement in CI.
- **Relaunch.** `AppProvider` opens the store at launch (reading the
  persisted envelope) before attaching the recorder, so safe and redacted
  events re-fetch correctly after restart. Covered by the relaunch
  round-trip test in `src/history/historyStore.test.ts`, which writes with
  one store instance and re-fetches with a second over the same file.
