# History storage

The Swift port preserves `com.marginallybetter.qrscanner` and `Documents/history/history-v1.json`. The JSON envelope remains `{ "version": 1, "events": [...] }`. Existing event IDs, timestamps, kinds, summaries, originals, and parser versions decode without conversion. Events written by this version use the same keys (`id`, `acceptedAt`, `kind`, `summary`, `original`, `parserVersion`, optional `format`), so earlier Swift builds can still read them.

`Sources/QRScannerCore/HistoryStore.swift` writes atomically with complete iOS file protection in a single `Data.write(to:options: [.atomic, .completeFileProtection])`. The directory also uses complete protection. Standard device backup behavior is unchanged. No network or cloud synchronization is involved.

`acceptedAt` is parsed once when an event is decoded, with or without fractional seconds and with `Z` or a numeric offset. An unparseable timestamp sorts last instead of failing the file. The persisted `kind` string maps to a typed `HistoryEvent.Category`; unknown kinds are kept and shown as text.

Every new scan stores the complete original payload, including authentication codes, private keys, Wi-Fi credentials, boarding passes, and credential-bearing links. Copy and Share export that exact payload. Parser version 5 reclassifies older originals without changing or removing them. Previously redacted rows remain readable, but data omitted by older builds cannot be recovered. Backgrounding discards sensitive in-memory results; their saved History remains available.

Recording keeps the 5,000 newest scans; the oldest rows are dropped when a new scan exceeds that. Opening a larger file never trims or rewrites it.

Deletion is committed before a row disappears. Undo restores the exact event and timestamp for five seconds. An unreadable History file is left unchanged and the app reports the failure once. History is reopened when the app becomes active, when protected data becomes available after unlock, and before each scan is saved, so a launch while the device is locked does not stop saving for the rest of the process. While the file stays unreadable, each scan reports that it could not be saved instead of being dropped silently.

History is grouped by calendar day in the current time zone. Headers read Today, Yesterday, the weekday for two to six days ago, then the full date, all localized.

Migration, corruption handling, persistence, ordering, the size cap, day grouping, and repeated delete/undo are covered by `swift test`.

## Optional scan location

The version-1 envelope and file path are unchanged. Events may add an optional `location` object with `latitude`, `longitude`, `placeName`, and ISO 8601 `capturedAt`. Legacy events omit it, and legacy decoders ignore the new key. Redaction, delete, Undo, and reload preserve metadata. Location enrichment updates only an event that still exists, so a delayed fix cannot restore a deleted scan. Place text and coordinate fallbacks are searchable. Live scans use only a fix within 60 seconds of acceptance; photo imports omit location.
