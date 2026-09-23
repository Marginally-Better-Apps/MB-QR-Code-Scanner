import CoreGraphics
import CoreVideo

/// The camera and image acceptance path share decoding, projection, and typed delivery.
struct QRScanFrame {
  let observations: [QRVisionObservation]
  let imageSize: CGSize

  static func detect(in pixelBuffer: CVPixelBuffer) throws -> QRScanFrame {
    QRScanFrame(observations: try QRVisionDetector.detect(in: pixelBuffer), imageSize: CGSize(
      width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer)
    ))
  }

  static func detect(in image: CGImage) throws -> QRScanFrame {
    QRScanFrame(observations: try QRVisionDetector.detect(in: image), imageSize: CGSize(width: image.width, height: image.height))
  }

  func detections(previewSize: CGSize) -> [Detection] {
    observations.compactMap { observation in
      Detection.inPreview(payload: observation.payload, displayedBounds: QRPreviewGeometry.aspectFillBounds(
        normalizedImageBounds: observation.normalizedBounds,
        pixelBufferSize: imageSize,
        previewSize: previewSize
      ), previewSize: previewSize)
    }
  }
}
