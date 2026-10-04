import CoreImage
import Foundation
import ImageIO
import Testing
@testable import QRScannerCore

/// Real pixels through the app's Vision request and preview projection on macOS.
/// The Simulator run in `scripts/test-native-qr-decoder.sh` repeats the QR cases with the iOS SDK.
@Suite struct VisionDecodingTests {
  static let fixturePayload = "https://example.com/native-image-fixture"
  static let fixtures = ["normal-qr", "damaged-distant-qr"].map { name in
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("native/QRScanner/Fixtures/\(name).png")
  }

  @Test(arguments: fixtures)
  func bundledFixtureDecodesAsImageAndInEveryOrientation(_ url: URL) throws {
    let image = try CodeImages.fixtureImage(at: url)
    try expectDetections(try QRScanFrame.detect(in: image), [Self.fixturePayload])
    for orientation in [CGImagePropertyOrientation.up, .right, .down, .left] {
      let pixels = try CodeImages.pixelBuffer(CIImage(cgImage: image).oriented(orientation))
      try expectDetections(try QRScanFrame.detect(in: pixels), [Self.fixturePayload])
    }
  }

  @Test(arguments: [
    "https://example.com/live-camera?unique=4921", "Hello from a real QR image",
    "mailto:scanner@example.com", "tel:+14155552671", "SMSTO:+14155552671:Hello",
    "geo:37.7,-122.4", "WIFI:T:WPA;S:Test Network;P:disposable;;",
    "MECARD:N:Tester,Camera;TEL:+14155552671;;",
    "BEGIN:VEVENT\nDTSTART:20261001T120000Z\nSUMMARY:Camera test\nEND:VEVENT",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP", "myapp://test?value=42",
  ])
  func payloadKindsSurviveDecoding(_ payload: String) throws {
    try expectDetections(try QRScanFrame.detect(in: CodeImages.pixelBuffer(CodeImages.qr(payload))), [payload])
  }

  // iOS Simulator 26.5's Vision returns no Aztec result even with a single Aztec symbology
  // and CPU stages, so these formats are checked here. Physical scanning needs the device checklist.
  @Test(arguments: [
    ("CIAztecCodeGenerator", "AZTEC-BOARDING-PASS-TEST", "Aztec"),
    ("CIPDF417BarcodeGenerator", "PDF417-BOARDING-PASS-TEST", "PDF417"),
    ("CICode128BarcodeGenerator", "CODE128-PARCEL-TEST", "Code128"),
  ])
  func otherSymbologiesReportTheirFormat(_ filterName: String, _ payload: String, _ format: String) throws {
    let frame = try QRScanFrame.detect(in: CodeImages.pixelBuffer(CodeImages.generated(filterName, payload: payload)))
    try expectDetections(frame, [payload], formatSuffix: format)
  }

  @Test func retailBarcodeReportsEAN13() throws {
    let gtin = "3017624010701"
    try expectDetections(try QRScanFrame.detect(in: CodeImages.pixelBuffer(CodeImages.ean13(gtin))), [gtin], formatSuffix: "EAN13")
  }

  @Test func multipleCodesInOneFrameAllDecode() throws {
    let payloads = ["https://example.com/left-code", "Hello from the right code"]
    let image = CodeImages.sideBySide(CodeImages.qr(payloads[0]), CodeImages.qr(payloads[1]))
    let detections = try expectDetections(try QRScanFrame.detect(in: CodeImages.pixelBuffer(image)), payloads)
    let left = try #require(detections.first { $0.payload == payloads[0] })
    let right = try #require(detections.first { $0.payload == payloads[1] })
    #expect(left.bounds.maxX <= right.bounds.minX)
  }

  @Test func blankFrameHasNoDetections() throws {
    try expectDetections(try QRScanFrame.detect(in: CodeImages.pixelBuffer(CodeImages.blank())), [])
  }

  @discardableResult
  private func expectDetections(_ frame: QRScanFrame, _ expected: [String], formatSuffix: String? = nil) throws -> [Detection] {
    let detections = frame.detections(previewSize: frame.imageSize)
    #expect(Set(detections.map(\.payload)) == Set(expected))
    if let formatSuffix {
      #expect(detections.allSatisfy { $0.format.rawValue.hasSuffix(formatSuffix) }, "\(detections.map(\.format.rawValue))")
    }
    for detection in detections {
      #expect(detection.bounds.width > 0 && detection.bounds.height > 0)
      #expect(detection.bounds.minX >= 0 && detection.bounds.maxX <= 1.0001)
      #expect(detection.bounds.minY >= 0 && detection.bounds.maxY <= 1.0001)
    }
    return detections
  }
}
