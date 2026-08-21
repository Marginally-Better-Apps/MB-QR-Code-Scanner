import AppKit
import Foundation

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
        let image = NSImage(contentsOfFile: path),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
      else {
        throw NSError(domain: "NativeQRDecoderTest", code: 2)
      }
      let payloads = try QRVisionDetector.detect(in: cgImage).compactMap(\.payload)
      guard payloads.contains(expected) else {
        throw NSError(
          domain: "NativeQRDecoderTest",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "Failed to decode \(path): \(payloads)"]
        )
      }
    }

    print("Decoded normal and damaged distant QR fixtures")
  }
}
