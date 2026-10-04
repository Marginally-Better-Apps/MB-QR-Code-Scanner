import Foundation
import CoreGraphics

struct Detection: Identifiable, Equatable {
  let payload: String
  let format: CodeFormat
  var bounds: CGRect
  var id: String { format.rawValue + ":" + payload.precomposedStringWithCanonicalMapping.trimmingCharacters(in: .whitespacesAndNewlines) }

  init(_ payload: String, format: CodeFormat = .qr, bounds: CGRect = .zero) {
    self.payload = payload
    self.format = format
    self.bounds = bounds
  }

  static func inPreview(payload: String?, format: CodeFormat = .qr, displayedBounds: CGRect, previewSize: CGSize) -> Detection? {
    guard let payload, !payload.isEmpty, previewSize.width > 0, previewSize.height > 0,
      displayedBounds.width > 0, displayedBounds.height > 0,
      displayedBounds.intersects(CGRect(origin: .zero, size: previewSize)) else { return nil }
    return Detection(payload, format: format, bounds: CGRect(
      x: displayedBounds.minX / previewSize.width,
      y: displayedBounds.minY / previewSize.height,
      width: displayedBounds.width / previewSize.width,
      height: displayedBounds.height / previewSize.height
    ))
  }
}

struct ScanSession {
  struct Timing: Equatable {
    /// How long a highlight survives detection gaps.
    var holdDuration: TimeInterval = 1.5
    /// A code must be absent this long before it can be recorded again.
    var dedupeResetInterval: TimeInterval = 2
    /// A code seen in only one frame is accepted once it has been tracked this long.
    var acceptanceWindow: TimeInterval = 0.25
    static let standard = Timing()
  }
  static var holdDuration: TimeInterval { Timing.standard.holdDuration }
  let timing: Timing
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
  private var suspendedAt: Date?

  init(timing: Timing = .standard) {
    self.timing = timing
  }

  /// Acceptance uses only real frames. The UI hold never manufactures a scan.
  mutating func receive(_ frame: [Detection], at now: Date) -> [Detection] {
    if suspendedAt != nil { resume(at: now) }
    var accepted: [Detection] = []
    var seen: Set<String> = []
    for detection in frame where !detection.id.isEmpty {
      let id = detection.id
      guard seen.insert(id).inserted else { continue }
      if sightings[id] == nil { order.append(id) }
      sightings[id] = Sighting(detection: detection, lastSeen: now)
      if var track = tracks[id], now.timeIntervalSince(track.lastSeen) < timing.dedupeResetInterval {
        if !track.accepted && (previous.contains(id) || now.timeIntervalSince(track.firstSeen) >= timing.acceptanceWindow) {
          accepted.append(detection)
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
    guard suspendedAt == nil else { return }
    sightings = sightings.filter { now.timeIntervalSince($0.value.lastSeen) < timing.holdDuration }
    tracks = tracks.filter { now.timeIntervalSince($0.value.lastSeen) < timing.dedupeResetInterval }
    order.removeAll { sightings[$0] == nil }
    // A dismissal lasts until the code has been away long enough to count as a new scan.
    dismissed.formIntersection(Set(order).union(tracks.keys))
    highlights = order.compactMap { sightings[$0]?.detection }
    // Last results remain actionable when the camera moves away; only bounds expire.
    if !highlights.isEmpty {
      results = highlights.filter { !dismissed.contains($0.id) }
    }
  }

  mutating func dismiss(_ payload: String, format: CodeFormat = .qr) {
    let id = Detection(payload, format: format).id
    dismissed.insert(id)
    results.removeAll { $0.id == id }
  }

  /// Stops bookkeeping while capture is stopped in the foreground, such as while History is shown.
  /// Results and dedupe state survive, so a code that is still in view is not recorded again.
  mutating func suspend(at now: Date) {
    guard suspendedAt == nil else { return }
    expire(at: now)
    suspendedAt = now
    // Bounds from before the pause no longer match the preview.
    sightings.removeAll()
    order.removeAll()
    previous.removeAll()
    highlights.removeAll()
  }

  /// Time spent suspended does not count as absence.
  mutating func resume(at now: Date) {
    guard let suspendedAt else { return }
    self.suspendedAt = nil
    let pausedFor = max(0, now.timeIntervalSince(suspendedAt))
    for id in tracks.keys {
      tracks[id]?.firstSeen.addTimeInterval(pausedFor)
      tracks[id]?.lastSeen.addTimeInterval(pausedFor)
    }
  }

  /// Ends the session when the app leaves the foreground. Sensitive results are discarded.
  mutating func pause() {
    suspendedAt = nil
    sightings.removeAll()
    tracks.removeAll()
    order.removeAll()
    previous.removeAll()
    dismissed.removeAll()
    highlights.removeAll()
    results.removeAll { ScanPayload($0.payload, format: $0.format).isSensitive }
  }
}
