import CoreGraphics
import Foundation

@main
enum NativePreviewGeometryTest {
  static func main() throws {
    try assertPortraitAspectFillMapping()
    try assertLandscapeAspectFillMapping()
    print("Mapped Vision bounds into aspect-filled camera previews")
  }

  private static func assertPortraitAspectFillMapping() throws {
    let mapped = QRPreviewGeometry.aspectFillBounds(
      normalizedImageBounds: CGRect(
        x: 0.3,
        y: 0.4,
        width: 120.0 / 1080.0,
        height: 120.0 / 1920.0
      ),
      pixelBufferSize: CGSize(width: 1080, height: 1920),
      previewSize: CGSize(width: 390, height: 844)
    )

    try assertClose(mapped.minX, 100.05)
    try assertClose(mapped.minY, 337.6)
    try assertClose(mapped.width, 52.75)
    try assertClose(mapped.height, 52.75)
  }

  private static func assertLandscapeAspectFillMapping() throws {
    let mapped = QRPreviewGeometry.aspectFillBounds(
      normalizedImageBounds: CGRect(
        x: 0.4,
        y: 0.3,
        width: 120.0 / 1920.0,
        height: 120.0 / 1080.0
      ),
      pixelBufferSize: CGSize(width: 1920, height: 1080),
      previewSize: CGSize(width: 844, height: 390)
    )

    try assertClose(mapped.minX, 337.6)
    try assertClose(mapped.minY, 100.05)
    try assertClose(mapped.width, 52.75)
    try assertClose(mapped.height, 52.75)
  }

  private static func assertClose(
    _ actual: CGFloat,
    _ expected: CGFloat,
    tolerance: CGFloat = 0.01
  ) throws {
    guard abs(actual - expected) <= tolerance else {
      throw NSError(
        domain: "NativePreviewGeometryTest",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey: "Expected \(expected), got \(actual)",
        ]
      )
    }
  }
}
