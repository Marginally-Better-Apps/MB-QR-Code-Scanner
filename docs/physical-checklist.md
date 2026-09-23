# Physical-device acceptance

Install the native Release IPA through the PR's Autoloader link. Do not uninstall an existing version when checking History migration.

- Confirm old History rows survive an in-place update.
- Grant camera permission and scan immediately. Denied access should offer Open Settings.
- Scan a page with five QR codes. All results should appear in one panel without Choose.
- Briefly cover a code. Its highlight should survive a short gap, then disappear after 1.5 seconds without a sighting.
- Check Liquid Glass over bright and dark camera scenes, portrait and landscape, and large text.
- Open a result's native menu, copy, share, and inspect full details.
- Swipe a History row, tap Delete, Undo, then repeat on that same row and a different row.
- Check contacts, calendar, phone, messages, maps, and authentication handoffs. Never use real credentials for recordings.
- Background and resume. Capture should stop while inactive; secret results must disappear.
- Repeat on iPad and with VoiceOver and Reduce Transparency.

Automated coverage is in `Tests/QRScannerCoreTests`, `scripts/test-native-qr-decoder.sh`, and `e2e/native-ui-acceptance.yaml`. These checks do not replace real-camera verification.
