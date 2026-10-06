import CoreImage
import Foundation

/// Runs inside an iOS Simulator with `xcrun simctl spawn`, so decoding uses the iOS SDK's
/// Vision runtime rather than macOS. The macOS equivalents, plus Aztec, PDF417, Code 128,
/// and EAN-13 (which Simulator 26.5's Vision does not decode), are in `swift test`.
@main
enum NativeQRDecoderTest {
  static func main() throws {
    #if !targetEnvironment(simulator)
    throw CodeImages.Failure(description: "Build for the iOS Simulator; macOS decoding runs in swift test")
    #else
    let expected = "https://example.com/native-image-fixture"
    let paths = CommandLine.arguments.dropFirst()
    guard paths.count == 2 else {
      throw CodeImages.Failure(description: "Pass the two bundled fixture image paths")
    }

    for path in paths {
      let image = try CodeImages.fixtureImage(at: URL(fileURLWithPath: path))
      try check(try QRScanFrame.detect(in: image), expected: [expected])
      for orientation in [CGImagePropertyOrientation.up, .right, .down, .left] {
        try check(try QRScanFrame.detect(in: CodeImages.pixelBuffer(CIImage(cgImage: image).oriented(orientation))), expected: [expected])
      }
    }

    let payloads = [
      "https://example.com/live-camera?unique=4921", "Hello from a real QR image",
      "mailto:scanner@example.com", "tel:+14155552671", "SMSTO:+14155552671:Hello",
      "geo:37.7,-122.4", "WIFI:T:WPA;S:Test Network;P:disposable;;",
      "MECARD:N:Tester,Camera;TEL:+14155552671;;",
      "BEGIN:VEVENT\nDTSTART:20261001T120000Z\nSUMMARY:Camera test\nEND:VEVENT",
      "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP", "myapp://test?value=42",
    ]
    for payload in payloads {
      try check(try QRScanFrame.detect(in: CodeImages.pixelBuffer(CodeImages.qr(payload))), expected: [payload])
    }
    let multiple = CodeImages.sideBySide(CodeImages.qr(payloads[0]), CodeImages.qr(payloads[1]))
    try check(try QRScanFrame.detect(in: CodeImages.pixelBuffer(multiple)), expected: Array(payloads.prefix(2)))
    try check(try QRScanFrame.detect(in: CodeImages.pixelBuffer(CodeImages.blank())), expected: [])
    print("Simulator: real QR pixels → BGRA camera buffers → typed detections → results → persisted History")
    print("Covered QR fixtures in four orientations, payload kinds, multiple codes, and a blank frame")
    #endif
  }

  private static func check(_ frame: QRScanFrame, expected: [String]) throws {
    let detections = frame.detections(previewSize: frame.imageSize)
    guard Set(detections.map(\.payload)) == Set(expected) else {
      throw failure("Lost decoded results: expected \(expected), got \(detections.map(\.payload))")
    }
    guard detections.allSatisfy({ $0.bounds.width > 0 && $0.bounds.height > 0 && $0.bounds.minX.isFinite && $0.bounds.minY.isFinite }) else {
      throw failure("Invalid preview bounds")
    }
    var session = ScanSession()
    let now = Date()
    _ = session.receive(detections, at: now)
    guard Set(session.results.map(\.payload)) == Set(expected) else { throw failure("Results did not reach session") }
    let accepted = session.receive(detections, at: now.addingTimeInterval(0.1))
    guard Set(accepted.map(\.payload)) == Set(expected) else { throw failure("Scan acceptance lost results") }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try HistoryStore(directory: directory)
    for detection in accepted { try store.record(ScanPayload(detection.payload, format: detection.format), at: now) }
    let reopened = try HistoryStore(directory: directory)
    guard reopened.events.count == expected.count else { throw failure("History lost results") }
    for raw in expected {
      let parsed = ScanPayload(raw)
      if parsed.isSensitive || parsed.kind == .wifi {
        guard !reopened.events.contains(where: { $0.original == raw }) else { throw failure("Secret persisted") }
      } else {
        guard reopened.events.contains(where: { $0.original == raw }) else { throw failure("History changed payload") }
      }
    }
  }

  private static func failure(_ message: String) -> CodeImages.Failure {
    CodeImages.Failure(description: message)
  }
}
