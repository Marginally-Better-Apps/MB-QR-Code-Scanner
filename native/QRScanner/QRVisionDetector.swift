import CoreGraphics
import CoreImage
import CoreVideo
import Foundation
import ImageIO
import Vision

struct QRVisionObservation {
  let payload: String?
  let normalizedBounds: CGRect
}

enum QRVisionDetector {
  static func detect(
    in image: CGImage,
    orientation: CGImagePropertyOrientation = .up
  ) throws -> [QRVisionObservation] {
    let request = makeRequest()
    try VNImageRequestHandler(
      cgImage: image,
      orientation: orientation,
      options: [:]
    ).perform([request])
    let observations = observations(from: request)
    return observations.isEmpty
      ? coreImageObservations(in: CIImage(cgImage: image))
      : observations
  }

  static func detect(
    in pixelBuffer: CVPixelBuffer,
    orientation: CGImagePropertyOrientation = .up
  ) throws -> [QRVisionObservation] {
    let request = makeRequest()
    try VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: orientation,
      options: [:]
    ).perform([request])
    let observations = observations(from: request)
    return observations.isEmpty
      ? coreImageObservations(in: CIImage(cvPixelBuffer: pixelBuffer))
      : observations
  }

  private static func makeRequest() -> VNDetectBarcodesRequest {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    return request
  }

  private static func observations(
    from request: VNDetectBarcodesRequest
  ) -> [QRVisionObservation] {
    (request.results ?? []).map { observation in
      let bounds = observation.boundingBox
      return QRVisionObservation(
        payload: observation.payloadStringValue,
        normalizedBounds: CGRect(
          x: bounds.minX,
          y: 1 - bounds.maxY,
          width: bounds.width,
          height: bounds.height
        )
      )
    }
  }

  private static func coreImageObservations(
    in image: CIImage
  ) -> [QRVisionObservation] {
    guard
      image.extent.width > 0,
      image.extent.height > 0,
      let detector = CIDetector(
        ofType: CIDetectorTypeQRCode,
        context: nil,
        options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
      )
    else {
      return []
    }
    let extent = image.extent
    return detector.features(in: image).compactMap { feature in
      guard let qr = feature as? CIQRCodeFeature else {
        return nil
      }
      let bounds = qr.bounds
      return QRVisionObservation(
        payload: qr.messageString,
        normalizedBounds: CGRect(
          x: (bounds.minX - extent.minX) / extent.width,
          y: 1 - ((bounds.maxY - extent.minY) / extent.height),
          width: bounds.width / extent.width,
          height: bounds.height / extent.height
        )
      )
    }
  }
}
