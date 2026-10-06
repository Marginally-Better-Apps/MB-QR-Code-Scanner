import Foundation

struct ScanLocation: Codable, Equatable, Sendable {
  let latitude: Double
  let longitude: Double
  let placeName: String?
  let capturedAt: String

  init(latitude: Double, longitude: Double, placeName: String? = nil, capturedAt: Date) {
    self.latitude = latitude
    self.longitude = longitude
    self.placeName = placeName
    self.capturedAt = HistoryEvent.timestamp(capturedAt)
  }

  var displayName: String {
    if let placeName, !placeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return ScanPayload.visible(placeName, limit: 200)
    }
    return String(format: "%.4f, %.4f", latitude, longitude)
  }

  func isUsable(at date: Date) -> Bool {
    latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude)
      && abs(HistoryTimestamp.date(from: capturedAt).timeIntervalSince(date)) <= 60
  }
}

@MainActor protocol ScanLocating: AnyObject {
  var enabled: Bool { get set }
  var accessDenied: Bool { get }
  func location(at date: Date) async -> ScanLocation?
}

extension ScanLocating {
  var accessDenied: Bool { false }
}
