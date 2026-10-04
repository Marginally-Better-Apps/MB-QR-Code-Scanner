import Foundation

/// Bounded memo of parsed payloads keyed by exact raw value and format.
/// Parsing runs regular expressions, so it should not repeat for every camera tick or row render.
/// Not thread-safe; use it from one actor.
final class ScanPayloadCache {
  private struct Key: Hashable {
    let raw: String
    let format: CodeFormat
  }
  let capacity: Int
  private var storage: [Key: ScanPayload] = [:]
  private var insertionOrder: [Key] = []

  init(capacity: Int = 256) {
    precondition(capacity > 0)
    self.capacity = capacity
  }

  var count: Int { storage.count }

  func payload(_ raw: String, format: CodeFormat) -> ScanPayload {
    let key = Key(raw: raw, format: format)
    if let cached = storage[key] { return cached }
    let parsed = ScanPayload(raw, format: format)
    if storage.count >= capacity {
      // Oldest first. Capacity is small, so the array shift is cheap.
      let evicted = insertionOrder.removeFirst()
      storage[evicted] = nil
    }
    storage[key] = parsed
    insertionOrder.append(key)
    return parsed
  }

  func payload(for detection: Detection) -> ScanPayload {
    payload(detection.payload, format: detection.format)
  }

  func removeAll() {
    storage.removeAll()
    insertionOrder.removeAll()
  }
}
