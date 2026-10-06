# Physical-device acceptance

Simulator tests, `swift test`, and the Maestro flows cannot check the real camera, haptics, VoiceOver, system handoffs, or thermals. Run this before each App Store submission on one older supported iPhone, one current iPhone, and one iPad.

## Setup

1. Install the old App Store/TestFlight build and scan a few codes so History has rows.
2. Install the candidate Release build over it (PR Autoloader link or TestFlight). Do not uninstall first.
3. Generate the test sheet: `swift scripts/make-test-sheet.swift` writes `artifacts/test-sheet.html`. Open it on a Mac display or print it. Each card lists what the app should do.
4. Have real packaged products (EAN-13/UPC-A, UPC-E), a GS1 DataBar label (fresh produce), and a boarding pass test code ready. Never use real credentials, tickets, or Wi-Fi passwords in recordings.

## Upgrade and permissions

- Old History rows survive the update with the same titles and dates.
- On a fresh install, Scan prompts for the camera and scanning starts without navigating away.
- Deny the camera, then confirm the Open Settings path. Re-enable in Settings and return: the preview starts.

## Scanning

- Every card on the test sheet: check the result title, format label, actions, and the History row against the card text.
- Point at five codes at once: all appear in one panel without a chooser.
- Small, glossy, rotated, partly damaged, and far-away codes; codes at the frame edge.
- Cover a code briefly: its highlight survives a short gap, then disappears after about 1.5 seconds.
- Pinch to zoom at both extremes, tap to focus close, then aim far: focus recovers by itself and the square disappears.
- Torch on in a dark room, background the app, return: the torch is off.
- Pull down Control Center or receive a notification banner: capture keeps running and the same code is not added to History again.
- Open History while a code is in view, return within a few seconds: no duplicate History row.
- Rotate portrait → landscape → the opposite landscape (and upside down on iPad): the preview and highlights stay upright and aligned.
- On iPad, put Camera or FaceTime in Split View, then return: scanning resumes.

## Actions and handoffs

- Links open Safari. Long look-alike hosts keep the real domain visible. `HTTP://` shows Not Secure.
- App links and payment links always ask first. Uninstalled apps show the "App not installed" explanation.
- Authenticator (`otpauth`) and FIDO/passkey codes ask before handing off. They offer no Copy or Share and vanish when the app goes to the background.
- Email, Call, Text Message, and Open Map open the right apps with prefilled data. Carrier codes like `*21*…#` never dial.
- Add Contact and Add Event open the system editors with no permission prompt. Check the MECARD card brings both phone numbers, and the TZID event lands at the right local time.
- Wi-Fi: password masked, Copy Password works and expires, no Share, History says details not saved.
- Copy shows a confirmation. Copied text does not appear on other devices through Universal Clipboard.
- Look Up Product with a known product, a UPC-E product, an unknown code, and in Airplane Mode. No network request happens before the tap.

## History

- Rows group under Today, Yesterday, weekday names, then full dates.
- Swipe to delete (partial and full swipe), Undo, repeat on the same and a different row.
- Clear shows the scan count. Cancel keeps rows; Clear All empties History and stays empty after relaunch.
- Tap a row to replay it: details show the exact and relative time. Sensitive rows explain the details were not saved.
- Search finds rows by title and type.
- Launch the app while the device is locked (e.g. from Shortcuts), unlock, open History: rows load and new scans save.

## Accessibility and appearance

- VoiceOver: every control has a label, results are announced, menus and swipe actions are reachable. Follow `docs/accessibility-audit-checklist.md`.
- Largest accessibility text size: titles wrap up to three lines, nothing is clipped.
- Reduce Motion: panels and toasts fade instead of sliding.
- Increase Contrast and Reduce Transparency: panels become opaque with borders.
- Liquid Glass over bright and dark camera scenes. Spanish locale strings fit.

## Performance

Follow `docs/performance-budgets.md`: ten minutes of continuous capture on the older and current iPhone, recording median and worst-case time to a result, memory, thermal state, and behaviour in Low Power Mode. The slow-regex stress card on the test sheet must appear instantly without stutter.

## Photo import and scan location

- Select a QR photo from the shared Photos/History pill with camera access allowed and denied. Test a screenshot, HEIC camera photo, rotated photo, multiple codes, blank image, iCloud download, and cancel. Verify results and safe History persistence.
- Drag an image from Photos and Files onto Scanner on iPhone and iPad, including Split View. Verify import feedback and no camera bounds on photo results.
- Enable Save scan location in History settings. Allow approximate location, scan a code, and search its place name in History. Test denied permission, Location Services off, airplane mode, Settings recovery, and turning the setting off. Imported photos must never use the current location.
- Delete or clear a scan while its location resolves. It must stay deleted. Undo must restore the exact saved event.
