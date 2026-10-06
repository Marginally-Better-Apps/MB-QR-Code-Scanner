# MB QR Scanner store draft

Working copy for the 1.0 release. The App Store record already exists as MB QR Scanner; this draft can still be tweaked before submission.

| Field | Value |
| --- | --- |
| Platform | iOS |
| Name | MB QR Scanner |
| Name beneath the app icon | MB QR Scanner |
| Primary language | English (US) |
| Bundle ID | `com.marginallybetter.qrscanner` |
| SKU | `mb-qr-scanner-ios` |
| Subtitle | Barcodes, photos & history |
| Primary category | Utilities |
| Keywords | `reader,image,location,aztec,pdf417,data matrix,upc,ean,code128,contact,wifi,offline,boarding pass` |
| Support URL | https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner |
| Privacy policy URL | https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/blob/main/docs/privacy-policy.md |
| Feedback email | help@marginally-better.app |

## Promotional text

Scan a code with your camera or from a photo. Open it, use it, and find it again in History.

## Description

Got a code on a menu, a package, or a photo? MB QR Scanner reads it and keeps your past scans in one place.

Point your camera at a QR code or barcode, or pick a photo you already have. If there are a few codes in view, you can choose from all the results.

Open a link, copy some text, or add a contact or event. Come back to History when you need a past scan. Turn on location saving if you'd like to remember where you found a code, then search for that place later.

Codes it reads, starting with the ones you're most likely to run into:

- QR codes
- UPC-A and EAN-13 product barcodes
- EAN-8 product barcodes
- UPC-E product barcodes
- Code 128
- PDF417
- Aztec
- Data Matrix
- Code 39
- Code 93
- ITF-14
- GS1 DataBar
- GS1 DataBar Expanded
- GS1 DataBar Limited
- Interleaved 2 of 5
- Interleaved 2 of 5 with a checksum
- Codabar
- Micro QR
- MicroPDF417
- Code 39 with a checksum
- Code 39 Full ASCII
- Code 39 Full ASCII with a checksum
- Code 93i
- MSI Plessey

That includes airline boarding passes encoded as QR, Aztec, PDF417, or Data Matrix. You can see the route and flight without saving passenger or ticket details.

It also understands website links, plain text, Wi-Fi details, contacts in vCard or MECARD format, calendar events, email, phone numbers, SMS, map locations, and app links. Authenticator setup and export codes are recognized as sensitive and kept out of History. Available barcode formats depend on your iOS version.

Scanning happens on your device. No account, no ads, and no tracking. Camera images and imported photos aren't uploaded or saved by the app. Passwords, login codes, and boarding-pass contents aren't saved in History.

For product barcodes, tap Look Up Product to check Open Food Facts. That lookup needs internet; reading a code doesn't. Apple helps look up place names when you choose to save scan locations.

## TestFlight notes

Try a printed QR code, a retail barcode, and a photo with a code in it. Photos works even with camera access denied. Check History, deletion and Undo. To try place search, turn on Save scan location in History settings, scan a code, and search for its saved place. Imported photos do not get the current device location. There is no sign-in. Reading codes works offline; product lookup and looking up place names need internet.

## App Review notes

No sign-in or demo account is needed. Grant camera access and point the device at a QR code or barcode. History fills after a successful scan. Product lookup appears for valid retail barcodes and sends the barcode number to Open Food Facts only after a tap. Add Contact and Add Event open the standard iOS contact and event editors. The app does not request Contacts or Calendars access, so no permission prompt appears; nothing is saved unless you confirm in the system editor. Data Not Collected: product lookup is a user-initiated request sent directly to Open Food Facts. We do not receive, store, or link it. Photo selection and drag and drop work without camera permission. Save scan location is off by default and requests When In Use access only when enabled. Apple reverse geocoding may receive coordinates to find place names. Imported photos are never tagged with the current device location. Wi-Fi joining is manual through Settings.

## Screenshot copy

| Screen | Caption |
| --- | --- |
| Camera scan | Point. Scan. Open. |
| Photo results | That photo works too. |
| History | Keep the codes you need. |
| Place search | Find it by where you scanned. |
| Scan details | Pick up where you left off. |

Screenshots use sample scans in the real native app. The name, subtitle, and keywords are the search fields; this description is written for people. Apple also uses category and customer activity when ordering search results. [Apple's search guidance](https://developer.apple.com/app-store/search/).
