import Foundation
import CoreGraphics

struct Detection: Identifiable, Equatable {
  let payload: String
  var bounds: CGRect
  var id: String { payload.precomposedStringWithCanonicalMapping.trimmingCharacters(in: .whitespacesAndNewlines) }

  init(_ payload: String, bounds: CGRect = .zero) {
    self.payload = payload
    self.bounds = bounds
  }

  static func inPreview(payload: String?, displayedBounds: CGRect, previewSize: CGSize) -> Detection? {
    guard let payload, !payload.isEmpty, previewSize.width > 0, previewSize.height > 0,
      displayedBounds.width > 0, displayedBounds.height > 0,
      displayedBounds.intersects(CGRect(origin: .zero, size: previewSize)) else { return nil }
    return Detection(payload, bounds: CGRect(
      x: displayedBounds.minX / previewSize.width,
      y: displayedBounds.minY / previewSize.height,
      width: displayedBounds.width / previewSize.width,
      height: displayedBounds.height / previewSize.height
    ))
  }
}

struct ScanSession {
  static let holdDuration: TimeInterval = 1.5
  private struct Sighting {
    var detection: Detection
    var lastSeen: Date
  }
  private struct Track {
    var firstSeen: Date
    var lastSeen: Date
    var accepted = false
  }
  private var sightings: [String: Sighting] = [:]
  private var order: [String] = []
  private var tracks: [String: Track] = [:]
  private var previous: Set<String> = []
  private var dismissed: Set<String> = []
  private(set) var highlights: [Detection] = []
  private(set) var results: [Detection] = []

  /// Acceptance uses only real frames. The UI hold never manufactures a scan.
  mutating func receive(_ frame: [Detection], at now: Date) -> [String] {
    var accepted: [String] = []
    var seen: Set<String> = []
    for detection in frame where !detection.id.isEmpty {
      let id = detection.id
      guard seen.insert(id).inserted else { continue }
      if sightings[id] == nil { order.append(id) }
      sightings[id] = Sighting(detection: detection, lastSeen: now)
      if var track = tracks[id], now.timeIntervalSince(track.lastSeen) < 2 {
        if !track.accepted && (previous.contains(id) || now.timeIntervalSince(track.firstSeen) >= 0.25) {
          accepted.append(detection.payload)
          track.accepted = true
        }
        track.lastSeen = now
        tracks[id] = track
      } else {
        tracks[id] = Track(firstSeen: now, lastSeen: now)
      }
    }
    previous = seen
    expire(at: now)
    return accepted
  }

  mutating func expire(at now: Date) {
    sightings = sightings.filter { now.timeIntervalSince($0.value.lastSeen) < Self.holdDuration }
    tracks = tracks.filter { now.timeIntervalSince($0.value.lastSeen) < 2 }
    order.removeAll { sightings[$0] == nil }
    dismissed.formIntersection(Set(order))
    highlights = order.compactMap { sightings[$0]?.detection }
    // Last results remain actionable when the camera moves away; only bounds expire.
    if !highlights.isEmpty {
      results = highlights.filter { !dismissed.contains($0.id) }
    }
  }

  mutating func dismiss(_ payload: String) {
    let id = Detection(payload).id
    dismissed.insert(id)
    results.removeAll { $0.id == id }
  }

  mutating func pause() {
    sightings.removeAll()
    tracks.removeAll()
    order.removeAll()
    previous.removeAll()
    dismissed.removeAll()
    highlights.removeAll()
    results.removeAll { ScanPayload($0.payload).isSensitive }
  }
}
