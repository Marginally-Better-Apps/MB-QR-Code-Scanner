# Authentication QR codes

The Swift parser recognizes OTP enrollment, authenticator exports, and FIDO hybrid codes. It does not decode secret material. The UI shows safe labels only. Copy and Share are unavailable for sensitive results. History stores a generic redacted event without the payload.

Valid OTP and FIDO codes offer an explicit system handoff. Successful handling depends on installed system capabilities; a failed handoff reports that the action is unavailable. Authenticator exports have no handoff. Malformed authentication data stays redacted and cannot be opened.

These rules are covered by `ScannerTests.swift` and `PayloadCompatibilityTests.swift`. Actual Passwords and nearby-device flows still require physical-device testing with disposable credentials.
