# Safe passkey and OTP QR capabilities

Spike for ACT-07, issue #26. Recognition, policy, and a Simulator route probe. This record does not ship a production Authenticate button or a password-manager extension.

The useful finding is narrower than the backlog hoped and broader than "Camera only." We can recognize the common auth QR formats. On iOS 26.5 Simulator, handing `otpauth://` or `FIDO:/` to the system via `openURL` reaches the Passwords app. We still cannot implement hybrid Bluetooth ourselves, enroll a secret through AuthenticationServices, or treat a migration blob as a safe import.

## Verdict

A third-party iOS scanner should identify FIDO hybrid QR, `otpauth` enrollment, and `otpauth-migration` export blobs. Identification is not enrollment.

Apple's public AuthenticationServices APIs let an app sign users into its own relying party, or let a credential-provider extension fill passkeys after the system already ran hybrid. They do not take a scanned `FIDO:/` string and return an assertion to our app. What they do on current iOS is register Passwords as a handler for those URIs. `xcrun simctl openurl` on an iPhone 17e Simulator running iOS 26.5 opened Passwords for `otpauth://` and showed the system "connect to the other device" sheet for `FIDO:/`.

That is a system-owned handoff, not a scanner-owned sign-in. #27 may confirm and then `openURL` those two URIs when `canOpenURL` is true. It must not implement CTAP hybrid, decode secrets, or claim the user finished sign-in just because Passwords appeared.

`otpauth-migration` also launched Passwords on that Simulator. The screen was first-run onboarding, not an import confirmation. There is still no documented importer and no evidence the dummy blob was consumed. Do not offer a button.

iOS 17 through 25 were not installed in this environment. #27 must call `canOpenURL` on the running device instead of assuming Passwords claims these schemes everywhere.

## Sources

Primary documents, retrieved 12 September 2026.

1. [FIDO Alliance, Passkeys](https://fidoalliance.org/passkeys/). Passkeys are FIDO2 credentials. Cross-device use belongs to a platform authenticator.
2. [Client to Authenticator Protocol (CTAP) 2.3 Proposed Standard, 26 February 2026](https://fidoalliance.org/specs/fido-v2.3-ps-20260226/fido-client-to-authenticator-protocol-v2.3-ps-20260226.html), §11.5 Hybrid transports and §11.5.1 QR-initiated transactions.
3. [Proximity Exchange Protocol 1.0 Working Draft, 17 July 2026](https://fidoalliance.org/specs/hybrid/proximity-exchange-protocol-v1.0-wd-20260717.html), §5.3. The QR payload is `FIDO:/` plus digit-encoded CBOR. Key 1 is a 16-byte QR secret. The phone advertises over Bluetooth Low Energy to prove proximity and open a tunnel. A double slash after `FIDO:` is forbidden.
4. [Supporting passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys). Apps create registration or assertion requests with `ASAuthorizationPlatformPublicKeyCredentialProvider` for a known relying-party ID.
5. [Connecting to a service with passkeys](https://developer.apple.com/documentation/authenticationservices/connecting-to-a-service-with-passkeys) and [ASAuthorizationController](https://developer.apple.com/documentation/authenticationservices/asauthorizationcontroller). The system sheet can offer nearby-device sign-in when *this app* is the relying party. That is a different job from scanning someone else's QR.
6. [ASCredentialProviderViewController](https://developer.apple.com/documentation/authenticationservices/ascredentialproviderviewcontroller) and [prepareInterface(forPasskeyRegistration:)](https://developer.apple.com/documentation/authenticationservices/ascredentialproviderviewcontroller/prepareinterface(forpasskeyregistration:)). iOS 17+ password managers plug into AutoFill. Out of scope for this scanner.
7. [WWDC22 session 10092, Meet passkeys](https://developer.apple.com/videos/play/wwdc2022/10092/). Nearby-device QR sign-in comes free once an app adopts `ASAuthorizationController` as the relying party. It is not a scanner API.
8. [Apple Developer Forums, thread 711563](https://developer.apple.com/forums/thread/711563). An Apple engineer wrote that apps do not decode the `FIDO:/` QR. The browser or OS generates it on one side and handles it on the other. Our probe matches that if "handle" means Passwords, not our process.
9. [Key URI Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format). `otpauth://TYPE/LABEL?secret=` is the enrollment URI. The `secret` query value is reusable key material.
10. [UIApplication.canOpenURL(_:)](https://developer.apple.com/documentation/uikit/uiapplication/canopenurl(_:)). iOS 9+ only reports foreign schemes listed in `LSApplicationQueriesSchemes`. `true` means some app claimed the scheme.

Google Authenticator's `otpauth-migration://offline?data=` export is widely implemented and not published as an Apple or FIDO standard. Treat `data` as an opaque secret blob. Do not cite unofficial protobuf layouts in product UI.

## Recognition versus invocation

Recognition means `recognizeAuthQr` in `src/scanner/authQr.ts` returns a format and a safe summary. Invocation means a user-confirmed handoff that the system actually presents.

| Format | How we recognize it | Safe summary | Verified invocation for this app |
| --- | --- | --- | --- |
| `otpauth` TOTP or HOTP | `otpauth://totp/` or `otpauth://hotp/` with a Base32 `secret` | `Authentication code` plus issuer when present | iOS 26.5 Simulator: `openURL` opens Passwords to a lock screen. Enrollment after unlock was not completed. Allowed for #27 only as confirm-then-`openURL` when `canOpenURL` is true. No AuthenticationServices enroll API. |
| `otpauth-migration` | `otpauth-migration://offline?data=` with a non-empty `data` query | `Authenticator export` | Not verified. The same Simulator opened Passwords onboarding, not an import UI. Do not offer a button. Do not decode the protobuf. |
| FIDO hybrid / passkey QR | `FIDO:/` plus at least ten decimal digits. No `FIDO://` | `Passkey sign-in` | iOS 26.5 Simulator: `openURL` presents a system sheet that the iPhone must connect to the other device to sign in or save a passkey. BLE, proximity, and the tunnel stay with the system. We did not finish pairing. A fake digit string still showed the sheet. #27 may confirm and `openURL` the raw payload when `canOpenURL` is true. Do not implement hybrid ourselves. |

Ordinary `https` pages that talk about passkeys stay web URLs. They are not this table.

`authenticate` remains an unimplemented ActionRouter case. #27 should add a named, confirmed `openURL` path, not a generic Authenticate that always fires.

## What this app still cannot do

- Implement CTAP hybrid or caBLE. iOS apps cannot set the reserved BLE service data.
- Feed a scanned `FIDO:/` string into `ASAuthorizationController` and get an assertion back.
- Become a credential-provider extension or password manager.
- Decode migration protobufs so the UI can list accounts.
- Promise that Passwords finished enrollment or sign-in. Opening the app is as far as the probe went.
- Assume the iOS 26.5 Simulator handlers exist on iOS 17. Feature-detect.

Camera on a physical iPhone can still scan a hybrid QR without our app. That remains the fallback copy when `canOpenURL` is false.

## Redaction and non-persistence

Every format in the table is `sessionOnly`. `toStorableHistoryEvent` maps that to a `redacted` row: UUID, accepted-at timestamp, parser version. No summary. No original. No secret fragment.

Defense in depth: `looksLikeSecretEnrollment` also matches `otpauth://`, `otpauth-migration:`, `fido:`, `passkey`, `webauthn`, `fido2`, and private-key blocks, even if a future parser regression classifies the payload as text or a custom scheme.

Exact rules for each recognized format:

| Format | Compact UI | Expanded UI | Persistent history | Logs, telemetry, crash breadcrumbs | Pasteboard | App-created screenshots | Session memory |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `otpauth` | Issuer or generic "Authentication code". Never the `secret` query. | Same safe text. Never the raw URI. | `redacted` kind and timestamp only. | Forbidden. | Forbidden. #27 must stop the current Copy control from writing the raw URI. | Forbidden. | Allowed until clear, replace, or process death. Backgrounding should drop it. |
| `otpauth-migration` | "Authenticator export". Never `data=`. | Same. Never the raw URI or decoded accounts. | Same as `otpauth`. | Forbidden. | Forbidden. | Forbidden. | Same lifetime as `otpauth`. |
| FIDO hybrid | "Passkey sign-in". Never the digit string. | Same. Never the raw `FIDO:/` payload. | Same as `otpauth`. | Forbidden. The digits encode the QR secret. | Forbidden. | Forbidden. | Same lifetime as `otpauth`. |

Copy and Share must not appear on these results. Today's sticky accessory still shows those buttons for every payload. That is a leak #27 has to close. This spike already stopped the view-model from putting the raw secret into compact or expanded text.

Do not parse migration or FIDO CBOR just to show a nicer label. The label is not worth the extra secret handling.

`openURL` hands the raw URI to Passwords. That is a user-confirmed system handoff, not pasteboard or history. It is the one place the secret may leave our process.

## Prototype log

Date: 12 September 2026. Host: macOS 26.5. Device: iPhone 17e Simulator, iOS 26.5, UDID `5D5A3D5F-31B4-4A41-8C0B-567C84806B12`. No physical iPhone was available, so Bluetooth pairing and a live laptop hybrid QR were not exercised. Do not read the rows below as a completed sign-in.

Synthetic payloads only. None are live credentials.

- `otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example`  
  Key URI Format example secret.
- `otpauth-migration://offline?data=ZGlzcG9zYWJsZS1maXh0dXJl`  
  Dummy `data`, not an exported vault.
- `FIDO:/000111222333444555666777888999`  
  Digit shape only. Not a live tunnel secret.

`xcrun simctl openurl` on that Simulator. Each call returned exit 0.

Redacted screenshots:

- [Passwords lock after `otpauth://`](https://planista.shloklab.us/4GPJDfai1jzY4lx4)
- [Passwords onboarding after `otpauth-migration://`](https://planista.shloklab.us/ueGFvkwvVDkwbOlP)
- [System connect sheet after `FIDO:/`](https://planista.shloklab.us/zqI1JffSWU2mQEO1)

| URI | What appeared | What we did not see |
| --- | --- | --- |
| `otpauth://…` | System Passwords, "Passwords Is Locked", Unlock | Unlock, an added verification-code row, or any enroll API callback |
| `otpauth-migration://…` | Passwords first-run welcome / Continue | An import confirmation or a list of migrated accounts |
| `FIDO:/…` | System sheet: the iPhone needs to connect to the other device to sign in or save a passkey. Copy says continue only if you scanned a QR for that purpose. | BLE pairing, a nearby laptop, or a finished assertion |
| `https://example.com/` | Safari, control that ordinary `openURL` still works | n/a |

Recognition of the same fixtures is locked in `src/scanner/authQr.test.ts` and the history policy tests. Compact UI shows the safe label and no Authenticate control.

A later physical-device pass should use disposable credentials only and record:

1. Our app scans a real hybrid QR from a nearby laptop, user confirms, `openURL` runs, BLE succeeds or the system explains proximity. That is the missing completion evidence.
2. The same QR with `canOpenURL` false. Expect Camera fallback copy, no dead button.
3. `otpauth` through Passwords unlock on a signed-in device. Confirm whether a verification-code item appears. Until that exists, #27 may only promise "opens Passwords," not "secret was saved."
4. `otpauth-migration` after Passwords is already set up. If a real import UI appears, update this record. Until then, no button.

## Residual risk

The hybrid QR secret is in camera memory the moment Vision reads the payload. We never persist it, but a compromised process or a future log statement could still see it. Keep auth payloads out of `console`, analytics, and screenshot helpers.

`looksLikeSecretEnrollment` redacts any URL that merely mentions `otpauth://` or `passkey`. A documentation page can land in history as `redacted`. That is the safer miss.

False-positive `FIDO:/` recognition needs ten or more digits. A short custom `FIDO:` URI would fall through. History still redacts `fido:` markers.

`openURL` on a fake `FIDO:/` string still presented the connect sheet. A user who confirms anyway will send garbage at the system flow. #27 should warn that the other device must be the one showing the QR.

Someone will ask for "just open it" on migration codes. That hands every exported secret to whichever app claimed the scheme, with no import UI in this probe. Keep refusing.

Handlers can change by OS version. Gate the buttons on `canOpenURL` and keep this file in lockstep when Apple ships something new.

## Follow-up acceptance for #27

#27 may implement only what this spike verified. Comment this list on issue #27. Leave the original privacy AC in place. Replace the capability promise with the list below.

1. Identify `otpauth`, `otpauth-migration`, and `FIDO:/` hybrid payloads without putting secret material in compact or expanded summaries. Use the labels in the table above.
2. For FIDO hybrid, when `canOpenURL` is true for the scanned `FIDO:/` URI, offer one confirmed control that `openURL`s that exact payload. Copy must say the system will ask to connect to the nearby device and that Bluetooth has to be on. If `canOpenURL` is false, explain that Camera can still handle passkey QR codes and do not show a dead button. Do not implement BLE, caBLE, or a credential-provider extension.
3. Do not offer any handoff for `otpauth-migration`. Explain that the code is an authenticator export and that this app will not import or forward it.
4. For `otpauth`, when `canOpenURL` is true, offer one confirmed control that `openURL`s the enrollment URI. On current iOS 26 that reached Passwords. If `canOpenURL` is false, show the unsupported explanation. Declare `otpauth` and `FIDO` in `LSApplicationQueriesSchemes`. Do not show a disabled or speculative button.
5. Raw secrets must not enter persistent history, telemetry, logs, crash breadcrumbs, app-created screenshots, or the pasteboard. Hide Copy and Share on these results. Redacted history rows cannot replay or copy the secret. The only allowed secret egress is the confirmed `openURL` in items 2 and 4.
6. Backgrounding, clearing, or replacing the current result drops session-only auth state. A later scan of the same code may create a new redacted history event after the existing 2-second absence rule.
7. Keep using ActionRouter. Add an explicit confirmed-open action. Do not implement `authenticate` as a blanket `openURL`. Do not call undocumented APIs.

#27 must not ship an Authenticate button that throws, guesses, or skips confirmation. Opening Passwords is the verified ceiling. Finished sign-in is not.
