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
    #if !targetEnvironment(simulator)
    // iOS Simulator 26.5's Vision returns no Aztec result even with a single
    // Aztec symbology and CPU stages. Exercise these formats on macOS here;
    // physical iOS scanning still needs the device checklist.
    for (filterName, payload, format) in [
      ("CIAztecCodeGenerator", "AZTEC-BOARDING-PASS-TEST", "Aztec"),
      ("CIPDF417BarcodeGenerator", "PDF417-BOARDING-PASS-TEST", "PDF417"),
      ("CICode128BarcodeGenerator", "CODE128-PARCEL-TEST", "Code128"),
    ] {
      let frame = try QRScanFrame.detect(in: pixelBuffer(generatedCode(filterName, payload: payload)))
      try check(frame, expected: [payload], formatSuffix: format)
    }
    let gtin = "3017624010701"
    try check(try QRScanFrame.detect(in: pixelBuffer(ean13Image(gtin))), expected: [gtin], formatSuffix: "EAN13")
    #endif
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
    #if targetEnvironment(simulator)
    print("Simulator: QR images in four orientations, multiple codes, and a blank frame")
    #else
    print("macOS: QR images in four orientations, Aztec, PDF417, Code 128, EAN-13, multiple codes, and a blank frame")
    #endif
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

  private static func generatedCode(_ name: String, payload: String) -> CIImage {
    let generator = CIFilter(name: name)!
    generator.setValue(Data(payload.utf8), forKey: "inputMessage")
    let image = generator.outputImage!.transformed(by: .init(scaleX: 4, y: 4))
    let inset: CGFloat = 48
    let canvas = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0,
      width: image.extent.width + 2 * inset, height: image.extent.height + 2 * inset))
    return image.transformed(by: .init(translationX: inset, y: inset)).composited(over: canvas)
  }

  private static func ean13Image(_ code: String) -> CIImage {
    let leftOdd = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
    let leftEven = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
    let right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
    let parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
    let digits = code.compactMap(\.wholeNumberValue)
    var bits = "101"
    for index in 1...6 {
      bits += parity[digits[0]][parity[digits[0]].index(parity[digits[0]].startIndex, offsetBy: index - 1)] == "L"
        ? leftOdd[digits[index]] : leftEven[digits[index]]
    }
    bits += "01010"
    for index in 7...12 { bits += right[digits[index]] }
    bits += "101"
    let module = 5
    let width = (bits.count + 24) * module
    let height = 240
    let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
      bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.setFillColor(CGColor(gray: 0, alpha: 1))
    for (index, bit) in bits.enumerated() where bit == "1" {
      context.fill(CGRect(x: (index + 12) * module, y: 20, width: module, height: 200))
    }
    return CIImage(cgImage: context.makeImage()!)
  }

  private static func pixelBuffer(_ image: CIImage) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(kCFAllocatorDefault, Int(image.extent.width), Int(image.extent.height),
      kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer)
    guard status == kCVReturnSuccess, let buffer else { throw failure("Could not create camera-format buffer") }
    CIContext().render(image, to: buffer)
    return buffer
  }

  private static func check(_ frame: QRScanFrame, expected: [String], formatSuffix: String? = nil) throws {
    let detections = frame.detections(previewSize: frame.imageSize)
    guard Set(detections.map(\.payload)) == Set(expected) else {
      throw failure("Lost decoded results: expected \(expected), got \(detections.map(\.payload))")
    }
    if let formatSuffix, !detections.allSatisfy({ $0.format.rawValue.hasSuffix(formatSuffix) }) {
      throw failure("Wrong code format: \(detections.map(\.format.rawValue))")
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

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "NativeQRDecoderTest", code: 3, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
