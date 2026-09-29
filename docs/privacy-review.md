# Native privacy review

The app contains no analytics, third-party runtime, or JavaScript bundle. AVFoundation frames are processed on-device by Vision/Core Image and are not written to disk. Product lookup is the only network feature. It sends the validated retail number to the Open Food Facts API after the user taps "Look up product". It does not upload camera images or make requests while scanning.

Only explicit user actions open destinations or invoke the native share, contact, or calendar interfaces. Dangerous schemes and malformed web destinations have no open action. Display strings neutralize controls and bidirectional formatting characters; copying a standard result preserves its original payload.

OTP, FIDO, authenticator exports, private-key material, and IATA-style boarding passes are redacted from History and cannot be copied or shared. Boarding pass details show only route, flight, and day of year. Wi-Fi passwords and SSIDs are omitted from History; passwords are omitted from details. Clipboard writes are local-only and expire after two minutes.

History retains its original sandbox location and schema, uses atomic writes and complete file protection, and preserves standard device backup behavior. Corrupt or unsupported files are not overwritten. No cloud sync is implemented.

Swift tests cover the previous payload corpus, malformed codes, retail check digits, boarding pass redaction, secret handling, background cleanup, and migration. The native image test reads actual QR, Aztec, PDF417, Code 128, and EAN-13 pixels. Maestro covers the visible result and History path. Physical camera, product lookup, and system handoffs require the checks in `physical-checklist.md`.
