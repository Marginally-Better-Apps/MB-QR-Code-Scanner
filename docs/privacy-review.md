# Privacy + payload security review (QLT-05, issue #33)

Local-only QR scanning review: what is retained, what is redacted, where the
trust boundaries are, and what risk is accepted. Evidence is automated unless
marked *manual*.

## 1. Data inventory and retention (local-only)

| Data | Where it lives | Retention | Deletion |
|---|---|---|---|
| Camera frames (`CVPixelBuffer`) | RAM only, recognition queue | One frame in flight; dropped after detection | Automatic on next frame / session stop |
| Decoded payload string + bounds | RAM (scan session) until accept/clear | Sticky result lifetime | Clear button, new scan, tab switch away |
| Accepted safe scans (url/text/email/phone/sms/geo/contact/calendar) | `history-v1.json`, app sandbox | Until user deletes | Per-row delete, undo expiry, Clear all |
| Accepted Wi-Fi scans | `history-v1.json` as `{kind: 'wifi', summary: 'Wi-Fi network', original: null}` | Until user deletes; SSID/password never stored | Same as above |
| Accepted secrets (OTP, passkey/FIDO, key material, enrollment blobs) | `history-v1.json` as `{kind: 'redacted', summary: null, original: null}` | Timestamp only, until user deletes | Same as above |
| Clipboard / share sheet content | System pasteboard / share sheet, only after explicit tap | System-controlled | System-controlled |
| Diagnostics, analytics, crash reports | None collected | N/A | N/A |

There is no account, no backend, no analytics SDK, and no crash-reporting SDK.
`rg` over `src modules plugins scripts` finds no `fetch`, `XMLHttpRequest`,
`URLSession dataTask`, analytics, or crash-breadcrumb sink; the no-network
fixtures (`webUrlSecurity`, `actionRouter`, `historyStore`, `privacySecurity`
tests) spy on `fetch` across parse/display/record/dispatch and assert silence.

## 2. Explicit display policy

On-screen rendering of scanned content is the *only* place raw payloads may
appear, and it is bounded:

- Web results show the ASCII (Punycode) host emphasized plus a truncated path
  preview; the full destination opens only after a tap.
- Wi-Fi shows SSID + security with the password masked as `••••••••`. The
  expanded detail and compat nodes render a **redacted** payload
  (`redactedWifiPayload`, password field dropped), never the raw scan.
- OTP / passkey results show generic summaries (`Authentication code…`,
  `Passkey sign-in`); copy/share affordances are removed for session-only
  payloads and the router refuses them.
- All visible text passes through `sanitizeVisibleText`: controls, newlines,
  bidi overrides, and zero-width characters become `�`, output truncates with
  `…`.

## 3. Redaction policy (outside display)

- History rows: `toStorableHistoryEvent` — safe kinds keep summary + original;
  Wi-Fi keeps a generic summary only; session-only and secret-enrollment
  payloads keep kind + timestamp only. `historyReplay` never replays
  `redacted`/`wifi` rows, even if a corrupt file contains an original.
- Accessibility: `describeForAccessibility` is the single choke point.
  Structured session secrets announce their safe summary; unstructured secret
  blobs announce the generic history label (`Sensitive scan`); everything is
  sanitized. Raw payloads never reach `announceForAccessibility` or labels.
- Logs/diagnostics: the codebase emits no logs on the scan path (asserted by
  the console-silence fixture). `redactForLog` (masks `secret=`/`data=`,
  Wi-Fi `P:`, PEM blocks; neutralizes controls; truncates) and
  `diagnosticSummaryForPayload` (kind/sensitivity/version/action count only)
  are the mandatory helpers if logging is ever added.

## 4. Camera frames (*manual* audit + automated shape/static tests)

`ScannerPreviewView.captureOutput` runs Vision detection off-main-thread and
forwards **only** `{payload, displayBounds}` per observation to JS. It never
writes image data (`UIImageWriteToSavedPhotosAlbum`, `writeToFile`,
`FileManager`, `pngData`, `base64`), never logs (`NSLog`, `os_log`,
`print(`), and never uploads (`URLSession`) — locked by the static-source
fixture in `privacySecurity.test.tsx`, which fails if any of those tokens
appear in `ScannerPreviewView.swift` / `QRVisionDetector.swift`. The JS
observation-shape fixture asserts frames carry exactly
`{rawPayload, displayBounds, timestamp, engineID}`. The only `UserDefaults`
use in the module is launch fixture-flag plumbing in `ScannerEngineModule`,
unrelated to frames. Physical-device evidence: camera-specific behavior
requires on-device verification at release time (see residual risks).

## 5. Actions: tap-gated, public system APIs only

| Action | System API | Gate |
|---|---|---|
| Open URL / custom scheme | `Linking.openURL` (+ `canOpenURL`) | Explicit Open tap; blocked schemes refused before the gate |
| Compose email, call, SMS, maps | `Linking.openURL` (`mailto:`/`tel:`/`sms:`/Apple Maps) | Explicit tap; content-kind checked |
| Add contact / event | System share/present sheet via `presentContact`/`presentEvent` | Explicit tap; cancel leaves state unchanged |
| Join Wi-Fi | `joinWifi` driver (unavailable → explanatory state) | Explicit Join tap |
| Copy / share | `expo-clipboard` / system share sheet | Explicit tap; refused for session-only secrets |
| Auth handoff (OTP/passkey) | `Linking.openURL` to the system handler | Explicit tap; migration exports refused |

Importing or rendering never opens, copies, shares, or fetches (asserted by
the tap-gating fixture: render produces zero dep calls across URL, Wi-Fi,
and contact payloads).

## 6. Custom-scheme boundary

Unknown schemes parse as labeled `customScheme` (scheme shown, never styled
as a website). Scriptable/spoofable schemes —
`javascript`, `data`, `vbscript`, `jscript`, `blob`, `filesystem`, `about`,
`jar`, `file` — are blocked at three layers: the parser offers no `openApp`
action, `resolvePrimarySystemAction` returns no primary (no Open button), and
`dispatchResultAction` throws even against a permissive `canOpenURL`.
Benign schemes (`myapp://…`) still open after a tap. `otpauth`/`fido` never
flow through `openApp`; they use the `openAuth` path with migration-export
refusal.

## 7. Threat model

**Assets:** scanned secrets (OTP seeds, passkey material, Wi-Fi passwords,
private keys); scan history; camera frames; user trust in displayed links.

**Trust boundaries:** (1) camera/Vision pipeline → payload string;
(2) parser → classified content; (3) router → system APIs (tap-gated);
(4) policy → history file; (5) display/a11y → user.

| Abuse case | Mitigation |
|---|---|
| Spoofed host (`exаmple.com`, punycode) | Host normalized to ASCII at parse (`hostEncoding.ts`); display emphasizes the punycode host; history/announce use the normalized form |
| Control/bidi/zero-width injection in UI or speech | Neutralized to `�` in `sanitizeVisibleText` at every display/a11y choke point; newline-injected URLs fall back to non-clickable text |
| Oversized payload (layout abuse, storage bloat) | Display truncates with `…`; parse is total (no throw) and network-free; QR capacity bounds real-world size |
| Malformed percent escapes (decoder crash/differential) | No `decodeURIComponent` on untrusted paths; `URL`/`URLSearchParams` failures fall back to text; covered by fixture |
| `javascript:`/`data:`/etc. execution via Open | Triple-layer block (parser actions, primary resolution, dispatch refusal) + `canOpenURL` gate |
| Secret exfil via history file | Sensitivity policy redacts OTP/passkey/keys/Wi-Fi at write; replay refuses redacted rows even from corrupt files |
| Secret leak via logs/a11y/diagnostics | No logging on scan path; redaction helpers + a11y choke point; fixtures assert absence |
| Frame capture/persistence by the app | Frames never leave RAM except as payload strings (audited + statically locked) |
| Accidental destructive/share action | Every consequential action requires an explicit tap; cancel paths leave state unchanged |
| Clipboard shoulder-surfing after copy | Copy is explicit and user-directed; secrets (session-only) refuse copy/share entirely |

**Residual / accepted risk:**

- Pasteboard content after an explicit user copy is system-controlled (OS
  may sync/universal-clipboard it). Accepted: the tap is informed and
  explicit; session-only secrets cannot be copied at all.
- `canOpenURL` allow-listing is OS-controlled; a future OS handler for a
  blocked scheme would still hit the in-app blocklist first, but denylist
  maintenance is ongoing (follow-up: revisit list per release).
- History file rests in the app sandbox unencrypted at rest beyond OS
  data protection; secrets are never written there, but safe payloads are.
  A device backup carries the file. Accepted for a local-only utility;
  documented in the checklist below.
- Camera *physical-device* evidence (live frame non-persistence under
  Instruments, VoiceOver traversal of the result bar) is manual at release
  time, not CI.

## 8. Privacy checklist (attached evidence)

- [x] No network on scan/parse/display/history — fixtures in
  `src/scanner/webUrlSecurity.test.ts`, `src/scanner/actionRouter.test.ts`,
  `src/history/historyStore.test.ts`, `src/privacy/privacySecurity.test.tsx`
- [x] Frames never persisted/logged — `captureOutput` audit (§4) + static +
  shape fixtures
- [x] Raw/secrets out of logs/analytics/crash/a11y — redaction + a11y
  fixtures (`src/privacy/redaction.test.ts`, announce fixture); no analytics
  or crash SDK in the dependency set
- [x] URL edge fixtures — unicode/punycode (+ confusable), controls,
  oversized, malformed percent escapes, non-web/dangerous schemes
  (`webUrlSecurity.test.ts`, `webTextPresentation.test.ts`)
- [x] Tap-gated public-API actions — router + StickyResultBar fixtures;
  dangerous schemes render with no Open affordance
- [x] Delete purges payload bytes — file-bytes fixture incl. relaunch
  exclusion; retention table (§1) matches `historyPolicy` behavior
- [x] Threat model + record — this file, linked from the PR body

## 9. Follow-ups for #28 (deferred, non-blocking)

1. On-device release evidence: Instruments pass (no frame writes) and
   VoiceOver traversal of result bar + history detail.
2. Revisit the blocked-scheme denylist per release (e.g. new scriptable
   schemes, `itms-services:`-class installer links).
3. Evaluate OS data-protection file attributes (`NSFileProtectionComplete`)
   for `history-v1.json` if safe payloads warrant it.
4. Short acceptance media from the real UI (scan → redacted history →
   delete) attached at release.
