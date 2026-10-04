# Physical-device acceptance

Install the native Release IPA through the PR's Autoloader link. Do not uninstall an existing version when checking History migration.

- Confirm old History rows survive an in-place update.
- Grant camera permission and scan immediately. Denied access should offer Open Settings.
- Scan a page with five QR codes. All results should appear in one panel without Choose.
- Scan printed Aztec, Data Matrix, PDF417, EAN-8, EAN-13/UPC-A, UPC-E, Code 128, and GS1 samples. Check each format label and try small, glossy, rotated, and partly damaged codes.
- Scan an IATA boarding pass test code. Confirm the route and flight summary, no raw ticket in History, and no Copy or Share action.
- Look up a known retail product and an unknown code. Confirm the source attribution, missing-product state, and offline error. No lookup should occur before tapping the action.
- Time scans during ten minutes of continuous capture on an older supported iPhone and a current model. Record median and worst-case time to a result, dropped frames, memory, and thermal state.
- Briefly cover a code. Its highlight should survive a short gap, then disappear after 1.5 seconds without a sighting.
- Check Liquid Glass over bright and dark camera scenes, portrait and landscape, and large text.
- Open a result's native menu, copy, share, and inspect full details. Use each row's quick action, and confirm Copy shows a brief confirmation and Wi-Fi offers Copy Password.
- Turn the flashlight on in a dark room, then background the app. It should turn off and stay off on return. Tap to focus and confirm the focus square appears.
- Swipe a History row, tap Delete, Undo, then repeat on that same row and a different row.
- Check contacts, calendar, phone, messages, maps, and authentication handoffs. Add Contact and Add Event should open the system editors without a Contacts or Calendars permission prompt. Never use real credentials for recordings.
- Background and resume. Capture should stop while inactive; secret results must disappear.
- Repeat on iPad and with VoiceOver and Reduce Transparency.

Automated coverage is in `Tests/QRScannerCoreTests`, `scripts/test-native-qr-decoder.sh`, and the Maestro flows in `e2e/`. These checks do not replace real-camera verification.
