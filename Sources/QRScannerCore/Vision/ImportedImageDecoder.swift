import Foundation
import ImageIO

/// Decodes selected and dropped image bytes without retaining the image or its metadata.
enum ImportedImageDecoder {
  enum Failure: Error { case unreadable }

  static func decode(_ data: Data) throws -> [Detection] {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 4096,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary) else { throw Failure.unreadable }
    return try QRVisionDetector.detect(in: image).compactMap {
      guard let payload = $0.payload, !payload.isEmpty else { return nil }
      // Photo bounds must never be projected onto the live camera preview.
      return Detection(payload, format: $0.format)
    }
  }
}
