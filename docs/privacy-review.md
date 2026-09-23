# Native privacy review

The app contains no network client, analytics, third-party runtime, or JavaScript bundle. AVFoundation frames are processed on-device by Vision/Core Image and are not written to disk.

Only explicit user actions open destinations or invoke the native share, contact, or calendar interfaces. Dangerous schemes and malformed web destinations have no open action. Display strings neutralize controls and bidirectional formatting characters; copying a standard result preserves its original payload.

OTP, FIDO, authenticator exports, and private-key material are redacted from History and cannot be copied or shared. Wi-Fi passwords and SSIDs are omitted from History; passwords are omitted from details. Clipboard writes are local-only and expire after two minutes.

History retains its original sandbox location and schema, uses atomic writes and complete file protection, and preserves standard device backup behavior. Corrupt or unsupported files are not overwritten. No cloud sync is implemented.

Swift tests cover the previous payload corpus, malformed codes, secret handling, background cleanup, and migration. The native image test reads actual QR pixels. Maestro covers the visible result and History path. Physical camera and system handoffs require the checks in `physical-checklist.md`.
