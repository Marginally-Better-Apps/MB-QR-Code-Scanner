# Authentication QR codes

The Swift parser recognizes OTP enrollment, authenticator exports, and FIDO hybrid codes. The UI identifies the code and shows its complete original data. Copy and Share export the exact payload, and History retains it for replay, deletion, and Undo.

Valid OTP and FIDO codes offer an explicit system handoff. `Info.plist` lists `otpauth`, `otpauth-migration`, and `FIDO` in `LSApplicationQueriesSchemes` so `canOpenURL` can check for a handler. Successful handling depends on installed system capabilities; a failed handoff reports that the action is unavailable. Authenticator exports have no handoff. Malformed authentication data can be viewed, copied, shared, and saved, but cannot be opened as an authentication handoff.

These rules are covered by `ScannerTests.swift` and `PayloadCompatibilityTests.swift`. Actual Passwords and nearby-device flows still require physical-device testing with disposable credentials.
