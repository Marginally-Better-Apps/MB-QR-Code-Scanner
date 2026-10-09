# Native privacy review

The app contains no analytics, third-party runtime, or JavaScript bundle. AVFoundation frames are processed on-device by Vision/Core Image and are not written to disk. Product lookup and opt-in Apple reverse geocoding are the network features. Selected and dropped images are decoded on device and never persisted. Scan location is off by default and uses one foreground fix, with no continuous or background tracking. Reverse geocoding sends coordinates to Apple to find place names; lookup failure still permits local coordinates in History. Photo imports are never given the phone’s current location. It sends the validated retail number to the Open Food Facts API after the user taps "Look Up Product". It does not upload camera images or make requests while scanning.

Only explicit user actions open destinations or invoke the native share, contact, or calendar interfaces. Add Contact and Add Event present the system editors (`CNContactViewController(forNewContact:)` and the out-of-process `EKEventEditViewController` on iOS 17+), so the app never reads Contacts or Calendars and iOS does not ask for those permissions. The usage strings stay in `Info.plist` as a safeguard. Dangerous schemes and malformed web destinations have no open action. Display strings neutralize controls and bidirectional formatting characters; copying a standard result preserves its original payload.

All scanned codes retain their complete original payload in local History and offer Copy and Share. Raw Data shows the entire payload alongside readable summaries. Boarding pass summaries include passenger, booking reference, route, flight, day, cabin, seat, sequence, and status. Wi-Fi details include the decoded password. Display text neutralizes control characters, while Copy, Share, and History preserve the exact original string. Clipboard writes are local-only and expire after two minutes. Existing rows whose data was omitted by older versions cannot be recovered.

History retains its original sandbox location and schema, uses atomic writes and complete file protection, and preserves standard device backup behavior. Corrupt or unsupported files are not overwritten. No cloud sync is implemented.

## App Store privacy label

The privacy manifest (`native/QRScanner/PrivacyInfo.xcprivacy`) declares no tracking and no collected data types, and the App Store label should read **Data Not Collected**. Apple counts data as collected when it leaves the device in a way that lets the developer or its partners access it for longer than needed to service the request in real time. Product lookup does not meet that definition:

- It runs only after the user taps Look Up Product on a validated retail barcode. Nothing is sent while scanning.
- The request goes directly from the device to Open Food Facts' public API. We run no server, receive no copy, and have no data agreement or SDK from Open Food Facts.
- It sends only the barcode number in the URL, plus the IP address and headers every HTTPS request carries. The `User-Agent` identifies the app and our support address, not the user.
- We do not store the request, link it to an identity, or use it for tracking or advertising. Lookup results are not saved to History.

This matches opening a link the user chose. The privacy policy names Open Food Facts and links its policy. If App Review or counsel decides the lookup counts as collection, declare **Search History**: not linked to the user, not used for tracking, purpose App Functionality.

## Required-reason APIs

The manifest declares `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` (data accessible only to the app). `UserDefaults` stores the local Save scan location preference. It also reads Maestro fixture launch arguments in Debug or simulator builds. The declaration is harmless for device Release builds.

As of this review there are no file timestamp, system boot time, disk space, or active keyboard API calls in `native/QRScanner` or `Sources/QRScannerCore`. Re-check before release if code adds `attributesOfItem`, resource-value date keys, `systemUptime`, `mach_absolute_time`, or volume capacity keys.

## Coverage

Swift tests cover the previous payload corpus, malformed codes, retail check digits, boarding pass details, complete payload retention, background cleanup, and migration. The native image test reads actual QR, Aztec, PDF417, Code 128, and EAN-13 pixels. Maestro covers the visible result and History path. Physical camera, product lookup, and system handoffs require the checks in `physical-checklist.md`.
