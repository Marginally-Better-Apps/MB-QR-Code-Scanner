import CoreGraphics
import Testing
@testable import QRScannerCore

/// Vision bounds land where the aspect-filled preview layer draws the code.
@Suite struct PreviewGeometryTests {
  @Test func portraitBufferFillsPortraitPreview() {
    let mapped = QRPreviewGeometry.aspectFillBounds(
      normalizedImageBounds: CGRect(x: 0.3, y: 0.4, width: 120.0 / 1080.0, height: 120.0 / 1920.0),
      pixelBufferSize: CGSize(width: 1080, height: 1920),
      previewSize: CGSize(width: 390, height: 844)
    )
    expectClose(mapped, CGRect(x: 100.05, y: 337.6, width: 52.75, height: 52.75))
  }

  @Test func landscapeBufferFillsLandscapePreview() {
    let mapped = QRPreviewGeometry.aspectFillBounds(
      normalizedImageBounds: CGRect(x: 0.4, y: 0.3, width: 120.0 / 1920.0, height: 120.0 / 1080.0),
      pixelBufferSize: CGSize(width: 1920, height: 1080),
      previewSize: CGSize(width: 844, height: 390)
    )
    expectClose(mapped, CGRect(x: 337.6, y: 100.05, width: 52.75, height: 52.75))
  }

  @Test func croppedEdgesMapOutsideThePreview() {
    // A 4:3 buffer in a tall preview crops left and right, so the buffer's left edge is off screen.
    let mapped = QRPreviewGeometry.aspectFillBounds(
      normalizedImageBounds: CGRect(x: 0, y: 0, width: 0.1, height: 0.1),
      pixelBufferSize: CGSize(width: 1440, height: 1080),
      previewSize: CGSize(width: 390, height: 844)
    )
    #expect(mapped.minX < 0)
    #expect(abs(mapped.minY) < 0.01)
  }

  @Test func emptySizesProduceNoBounds() {
    let bounds = CGRect(x: 0.1, y: 0.1, width: 0.2, height: 0.2)
    #expect(QRPreviewGeometry.aspectFillBounds(normalizedImageBounds: bounds, pixelBufferSize: .zero, previewSize: CGSize(width: 390, height: 844)) == .zero)
    #expect(QRPreviewGeometry.aspectFillBounds(normalizedImageBounds: bounds, pixelBufferSize: CGSize(width: 1080, height: 1920), previewSize: .zero) == .zero)
  }

  private func expectClose(_ actual: CGRect, _ expected: CGRect, tolerance: CGFloat = 0.01) {
    #expect(abs(actual.minX - expected.minX) <= tolerance, "minX \(actual.minX)")
    #expect(abs(actual.minY - expected.minY) <= tolerance, "minY \(actual.minY)")
    #expect(abs(actual.width - expected.width) <= tolerance, "width \(actual.width)")
    #expect(abs(actual.height - expected.height) <= tolerance, "height \(actual.height)")
  }
}
