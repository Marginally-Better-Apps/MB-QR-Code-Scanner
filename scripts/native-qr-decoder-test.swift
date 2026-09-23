import CoreImage
import CoreVideo
import Foundation
import ImageIO

@main
enum NativeQRDecoderTest {
  static func main() throws {
    let expected = "https://example.com/native-image-fixture"
    let paths = CommandLine.arguments.dropFirst()
    guard paths.count == 2 else {
      throw NSError(domain: "NativeQRDecoderTest", code: 1)
    }

    for path in paths {
      guard
        let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
      else {
        throw NSError(domain: "NativeQRDecoderTest", code: 2)
      }
      try check(try QRScanFrame.detect(in: cgImage), expected: [expected])
      for orientation in [CGImagePropertyOrientation.up, .right, .down, .left] {
        let pixels = try pixelBuffer(CIImage(cgImage: cgImage).oriented(orientation))
        try check(try QRScanFrame.detect(in: pixels), expected: [expected])
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
      try check(try QRScanFrame.detect(in: pixelBuffer(qrImage(payload))), expected: [payload])
    }
    let first = qrImage(payloads[0]), second = qrImage(payloads[1])
    let gap: CGFloat = 40
    let extent = CGRect(x: 0, y: 0, width: first.extent.width + second.extent.width + gap,
      height: max(first.extent.height, second.extent.height))
    let white = CIImage(color: .white).cropped(to: extent)
    let multiple = second.transformed(by: .init(translationX: first.extent.width + gap, y: 0))
      .composited(over: first.composited(over: white))
    try check(try QRScanFrame.detect(in: pixelBuffer(multiple)), expected: Array(payloads.prefix(2)))
    let blank = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: 640, height: 480))
    try check(try QRScanFrame.detect(in: pixelBuffer(blank)), expected: [])
    print("Passed real QR pixels → BGRA camera buffers → typed detections → results → persisted History")
    print("Normal/damaged images in four orientations, 11 payload formats, multiple codes, and a blank frame")
  }

  private static func qrImage(_ payload: String) -> CIImage {
    let generator = CIFilter(name: "CIQRCodeGenerator")!
    generator.setValue(Data(payload.utf8), forKey: "inputMessage")
    generator.setValue("M", forKey: "inputCorrectionLevel")
    let code = generator.outputImage!.transformed(by: .init(scaleX: 8, y: 8))
    let size = code.extent.size
    let white = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: size.width + 64, height: size.height + 64))
    return code.transformed(by: .init(translationX: 32, y: 32)).composited(over: white)
  }

  private static func pixelBuffer(_ image: CIImage) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(kCFAllocatorDefault, Int(image.extent.width), Int(image.extent.height),
      kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer)
    guard status == kCVReturnSuccess, let buffer else { throw failure("Could not create camera-format buffer") }
    CIContext().render(image, to: buffer)
    return buffer
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
    guard Set(accepted) == Set(expected) else { throw failure("Scan acceptance lost results") }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try HistoryStore(directory: directory)
    for raw in accepted { try store.record(ScanPayload(raw), at: now) }
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

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "NativeQRDecoderTest", code: 3, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
