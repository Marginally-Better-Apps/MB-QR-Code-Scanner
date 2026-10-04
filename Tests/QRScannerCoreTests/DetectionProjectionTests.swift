import CoreGraphics
import Testing
@testable import QRScannerCore

/// Preview-space bounds become normalized `Detection` bounds; codes the preview cannot show are dropped.
@Suite struct DetectionProjectionTests {
  @Test func previewPointsNormalizeToUnitBounds() throws {
    let payload = "https://example.com/camera"
    let detection = try #require(Detection.inPreview(payload: payload,
      displayedBounds: CGRect(x: 39, y: 84.4, width: 156, height: 168.8),
      previewSize: CGSize(width: 390, height: 844)))
    #expect(detection.payload == payload)
    #expect(detection.format == .qr)
    #expect(abs(detection.bounds.minX - 0.1) < 0.0001)
    #expect(abs(detection.bounds.minY - 0.1) < 0.0001)
    #expect(abs(detection.bounds.width - 0.4) < 0.0001)
    #expect(abs(detection.bounds.height - 0.2) < 0.0001)
  }

  @Test func rejectsOnlyMissingPayloadOrUnlaidOutPreview() {
    let bounds = CGRect(x: 10, y: 10, width: 20, height: 20)
    #expect(Detection.inPreview(payload: nil, displayedBounds: bounds, previewSize: CGSize(width: 100, height: 100)) == nil)
    #expect(Detection.inPreview(payload: "", displayedBounds: bounds, previewSize: CGSize(width: 100, height: 100)) == nil)
    #expect(Detection.inPreview(payload: "code", displayedBounds: bounds, previewSize: .zero) == nil)
    #expect(Detection.inPreview(payload: "code", displayedBounds: bounds, previewSize: CGSize(width: 100, height: 100)) != nil)
  }

  @Test func dropsCodesOutsideTheVisiblePreview() {
    let preview = CGSize(width: 100, height: 200)
    for bounds in [CGRect(x: 150, y: 20, width: 20, height: 20), CGRect(x: 10, y: -50, width: 20, height: 20), .zero] {
      #expect(Detection.inPreview(payload: "offscreen", displayedBounds: bounds, previewSize: preview) == nil)
    }
    #expect(Detection.inPreview(payload: "partly visible", displayedBounds: CGRect(x: -10, y: 20, width: 20, height: 20), previewSize: preview) != nil)
  }

  @Test func scanFrameProjectsThroughTheAspectFilledPreview() throws {
    // A 4:3 landscape buffer in a portrait preview: the centered code stays, the left-edge code is cropped away.
    let frame = QRScanFrame(observations: [
      QRVisionObservation(payload: "center", format: .qr, normalizedBounds: CGRect(x: 0.45, y: 0.45, width: 0.1, height: 0.1)),
      QRVisionObservation(payload: "cropped", format: .qr, normalizedBounds: CGRect(x: 0.01, y: 0.45, width: 0.05, height: 0.1)),
      QRVisionObservation(payload: nil, format: .qr, normalizedBounds: CGRect(x: 0.45, y: 0.2, width: 0.1, height: 0.1)),
    ], imageSize: CGSize(width: 1440, height: 1080))
    let detections = frame.detections(previewSize: CGSize(width: 390, height: 844))
    #expect(detections.map(\.payload) == ["center"])
    let center = try #require(detections.first).bounds
    #expect(abs(center.midX - 0.5) < 0.0001)
    #expect(abs(center.midY - 0.5) < 0.0001)
  }
}
