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

Scan QR codes and barcodes with your camera or from a photo. Find past scans in History.

## Description

Scan QR codes and barcodes with your camera or from a photo. Keep past scans in History. Turn on location saving to search by place.

Read boarding passes, links, text, Wi-Fi details, contacts, calendar events, email, phone numbers, SMS, map locations, and app links.

Scanning works offline and happens on your device. No account, ads, or tracking.

Supported codes:

- QR codes
- UPC-A and EAN-13
- EAN-8
- UPC-E
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

Screenshots come from the real native app, scanning real photos of QR codes in the wild (see `design/store-screenshots`). History uses sample scans. Run `scripts/capture-store-screenshots.sh` to capture them at 6.9" iPhone and 13" iPad sizes. The name, subtitle, and keywords are the search fields. Apple also uses category and customer activity when ordering search results. [Apple's search guidance](https://developer.apple.com/app-store/search/).
