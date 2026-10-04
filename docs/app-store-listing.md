# App Store Connect listing draft

These fields describe the native 1.0.0 build of QR Scanner. They are ready to enter after the iOS app record exists.

| Field | Value |
| --- | --- |
| Platform | iOS |
| Name | QR Scanner |
| Primary language | English (US) |
| Bundle ID | `com.marginallybetter.qrscanner` |
| SKU | `mb-qr-scanner-ios` |
| Subtitle | Scan codes. Keep history. |
| Primary category | Utilities |
| Keywords | `barcode,QR,Aztec,PDF417,UPC,product,history,scanner` |
| Support URL | https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner |
| Privacy policy URL | https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/blob/main/docs/privacy-policy.md |
| Feedback email | help@marginally-better.app |

## Description

Scan QR codes and barcodes with your iPhone or iPad. QR Scanner reads codes on your device and shows multiple results together, so you can choose the one you need.

Open links, copy text, add contacts or events, and return to past scans in History. Supported code formats include QR, Aztec, Data Matrix, PDF417, EAN/UPC, Code 128, and other formats available through iOS Vision.

Product lookup is optional. Tap it on a valid retail barcode to check community product information from Open Food Facts. Camera images and scan History are not uploaded. Sensitive codes and raw boarding passes are kept out of History.

## TestFlight notes

Scan printed QR and retail barcodes. Check the result menu, History, and optional product lookup. Camera permission is required to scan. The app has no account or sign-in. Product lookup needs an internet connection; scanning does not.

## App Review notes

No sign-in or demo account is needed. Grant camera access and point the device at a QR code or barcode. History fills after a successful scan. Product lookup appears for valid retail barcodes and sends the barcode number to Open Food Facts only after a tap. Add Contact and Add Event open the standard iOS contact and event editors. The app does not request Contacts or Calendars access, so no permission prompt appears; nothing is saved unless you confirm in the system editor. Data Not Collected: product lookup is a user-initiated request sent directly to Open Food Facts. We do not receive, store, or link it.
