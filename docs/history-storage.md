# History storage

The Swift port preserves `com.marginallybetter.qrscanner` and `Documents/history/history-v1.json`. The JSON envelope remains `{ "version": 1, "events": [...] }`. Existing event IDs, timestamps, kinds, summaries, originals, and parser versions decode without conversion.

`Sources/QRScannerCore/HistoryStore.swift` writes atomically. The directory and files use complete iOS file protection. Standard device backup behavior is unchanged. No network or cloud synchronization is involved.

Authentication codes and private-key material store a generic redacted row with no original payload. Wi-Fi stores only a generic network row, without SSID or password. Backgrounding discards sensitive in-memory results.

Deletion is committed before a row disappears. Undo restores the exact event and timestamp. An unreadable History file is left unchanged and the app reports the failure. Migration, corruption handling, persistence, and repeated delete/undo are covered by `swift test`.
