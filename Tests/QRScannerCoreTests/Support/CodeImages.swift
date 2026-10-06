import CoreGraphics
import CoreImage
import CoreVideo
import Foundation
import ImageIO

/// Real code pixels rendered into camera-format buffers. Shared by `swift test` and the
/// Simulator decoder check in `scripts/test-native-qr-decoder.sh`, so it imports no test module.
enum CodeImages {
  struct Failure: Error, CustomStringConvertible {
    let description: String
  }

  static func fixtureImage(at url: URL) throws -> CGImage {
    guard
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw Failure(description: "Could not read \(url.lastPathComponent)")
    }
    return image
  }

  static func qr(_ payload: String) -> CIImage {
    let generator = CIFilter(name: "CIQRCodeGenerator")!
    generator.setValue(Data(payload.utf8), forKey: "inputMessage")
    generator.setValue("M", forKey: "inputCorrectionLevel")
    let code = generator.outputImage!.transformed(by: .init(scaleX: 8, y: 8))
    let size = code.extent.size
    let white = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: size.width + 64, height: size.height + 64))
    return code.transformed(by: .init(translationX: 32, y: 32)).composited(over: white)
  }

  static func generated(_ filterName: String, payload: String) -> CIImage {
    let generator = CIFilter(name: filterName)!
    generator.setValue(Data(payload.utf8), forKey: "inputMessage")
    let image = generator.outputImage!.transformed(by: .init(scaleX: 4, y: 4))
    let inset: CGFloat = 48
    let canvas = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0,
      width: image.extent.width + 2 * inset, height: image.extent.height + 2 * inset))
    return image.transformed(by: .init(translationX: inset, y: inset)).composited(over: canvas)
  }

  static func ean13(_ code: String) -> CIImage {
    let leftOdd = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
    let leftEven = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
    let right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
    let parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
    let digits = code.compactMap(\.wholeNumberValue)
    let firstParity = Array(parity[digits[0]])
    var bits = "101"
    for index in 1...6 {
      bits += firstParity[index - 1] == "L" ? leftOdd[digits[index]] : leftEven[digits[index]]
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

  /// Two codes side by side with a quiet gap, as on a page with several codes.
  static func sideBySide(_ first: CIImage, _ second: CIImage, gap: CGFloat = 40) -> CIImage {
    let extent = CGRect(x: 0, y: 0, width: first.extent.width + second.extent.width + gap,
      height: max(first.extent.height, second.extent.height))
    let white = CIImage(color: .white).cropped(to: extent)
    return second.transformed(by: .init(translationX: first.extent.width + gap, y: 0))
      .composited(over: first.composited(over: white))
  }

  static func blank() -> CIImage {
    CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: 640, height: 480))
  }

  /// Renders into the BGRA, IOSurface-backed format the capture output delivers.
  static func pixelBuffer(_ image: CIImage) throws -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(kCFAllocatorDefault, Int(image.extent.width), Int(image.extent.height),
      kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer)
    guard status == kCVReturnSuccess, let buffer else {
      throw Failure(description: "Could not create camera-format buffer")
    }
    CIContext().render(image, to: buffer)
    return buffer
  }
}
