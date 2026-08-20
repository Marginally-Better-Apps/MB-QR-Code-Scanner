import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins

let payload = "https://example.com/native-image-fixture"
let outputDirectory = CommandLine.arguments.dropFirst().first ?? "modules/scanner-engine/ios/Fixtures"

func qrImage(correctionLevel: String) throws -> CGImage {
  let filter = CIFilter.qrCodeGenerator()
  filter.message = Data(payload.utf8)
  filter.correctionLevel = correctionLevel
  guard let output = filter.outputImage else {
    throw NSError(domain: "QRFixture", code: 1)
  }
  let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
  guard let image = CIContext(options: [.useSoftwareRenderer: false]).createCGImage(scaled, from: scaled.extent) else {
    throw NSError(domain: "QRFixture", code: 2)
  }
  return image
}

func fixtureImage(damaged: Bool) throws -> CGImage {
  let width = 1200
  let height = 1600
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  guard let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    throw NSError(domain: "QRFixture", code: 3)
  }

  context.setFillColor(NSColor(calibratedWhite: 0.92, alpha: 1).cgColor)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))

  let qr = try qrImage(correctionLevel: damaged ? "H" : "M")
  let quietZone = CGRect(x: 390, y: 590, width: 420, height: 420)
  context.setFillColor(NSColor.white.cgColor)
  context.fill(quietZone)
  let qrRect = quietZone.insetBy(dx: 34, dy: 34)
  context.interpolationQuality = .none
  context.draw(qr, in: qrRect)

  if damaged {
    let obstruction = CGRect(x: quietZone.midX - 38, y: quietZone.midY - 38, width: 76, height: 76)
    context.setFillColor(NSColor.white.cgColor)
    context.fill(obstruction)
    context.setFillColor(NSColor.systemBlue.cgColor)
    context.fillEllipse(in: obstruction.insetBy(dx: 7, dy: 7))
  }

  guard let image = context.makeImage() else {
    throw NSError(domain: "QRFixture", code: 4)
  }
  return image
}

func writePNG(_ image: CGImage, name: String) throws {
  let directory = URL(fileURLWithPath: outputDirectory, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let representation = NSBitmapImageRep(cgImage: image)
  guard let data = representation.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "QRFixture", code: 5)
  }
  try data.write(to: directory.appendingPathComponent(name))
}

try writePNG(fixtureImage(damaged: false), name: "normal-qr.png")
try writePNG(fixtureImage(damaged: true), name: "damaged-distant-qr.png")
