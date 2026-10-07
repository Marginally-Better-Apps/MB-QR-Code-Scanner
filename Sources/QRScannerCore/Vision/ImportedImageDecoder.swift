import CoreGraphics
import Foundation
import ImageIO

/// A selected or dropped photo and the codes found in it. Held in memory only while it is on screen.
struct ImportedPhoto: @unchecked Sendable {
  /// A display-sized copy without metadata. `CGImage` is immutable.
  let image: CGImage
  /// Bounds are normalized to `image` with a top-left origin, never to the camera preview.
  let detections: [Detection]
}

/// Decodes selected and dropped image bytes. Metadata such as location is never read or kept.
enum ImportedImageDecoder {
  enum Failure: Error { case unreadable }

  static func decode(_ data: Data) throws -> ImportedPhoto {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = thumbnail(source, maxPixelSize: 4096) else { throw Failure.unreadable }
    let detections: [Detection] = try QRVisionDetector.detect(in: image).compactMap {
      guard let payload = $0.payload, !payload.isEmpty else { return nil }
      return Detection(payload, format: $0.format, bounds: $0.normalizedBounds)
    }
    // Decoding wants every pixel; the screen does not, so keep a smaller copy while it is shown.
    return ImportedPhoto(image: thumbnail(source, maxPixelSize: 2048) ?? image, detections: detections)
  }

  private static func thumbnail(_ source: CGImageSource, maxPixelSize: Int) -> CGImage? {
    CGImageSourceCreateThumbnailAtIndex(source, 0, [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
      kCGImageSourceShouldCacheImmediately: true,
    ] as CFDictionary)
  }
}
