import CoreGraphics
import Foundation
import Testing
@testable import QRScannerCore

@Test func nativeCGFloatCoordinatesReachResultsAndHistory() throws {
  let payload = "https://example.com/camera"
  let detection = try #require(Detection.inPreview(payload: payload,
    displayedBounds: CGRect(x: 39, y: 84.4, width: 156, height: 168.8),
    previewSize: CGSize(width: 390, height: 844)))
  #expect(detection.payload == payload)
  #expect(abs(detection.bounds.minX - 0.1) < 0.0001)
  #expect(abs(detection.bounds.minY - 0.1) < 0.0001)
  #expect(abs(detection.bounds.width - 0.4) < 0.0001)
  #expect(abs(detection.bounds.height - 0.2) < 0.0001)
  var session = ScanSession()
  let now = Date()
  #expect(session.receive([detection], at: now).isEmpty)
  #expect(session.results == [detection])
  #expect(session.receive([detection], at: now.addingTimeInterval(0.1)) == [payload])
  #expect(ScanPayload(payload).historyEvent(at: now).original == payload)
}

@Test func nativeDeliveryRejectsOnlyMissingPayloadOrUnlaidOutPreview() {
  let bounds = CGRect(x: 10, y: 10, width: 20, height: 20)
  #expect(Detection.inPreview(payload: nil, displayedBounds: bounds, previewSize: CGSize(width: 100, height: 100)) == nil)
  #expect(Detection.inPreview(payload: "code", displayedBounds: bounds, previewSize: .zero) == nil)
  #expect(Detection.inPreview(payload: "code", displayedBounds: bounds, previewSize: CGSize(width: 100, height: 100)) != nil)
}
