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
    let handler = VNImageRequestHandler(
      cgImage: image,
      orientation: orientation,
      options: [:]
    )
    return try perform(request, handler: handler, fallbackImage: CIImage(cgImage: image).oriented(orientation))
  }

  static func detect(
    in pixelBuffer: CVPixelBuffer,
    orientation: CGImagePropertyOrientation = .up
  ) throws -> [QRVisionObservation] {
    let request = makeRequest()
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: orientation,
      options: [:]
    )
    return try perform(request, handler: handler, fallbackImage: CIImage(cvPixelBuffer: pixelBuffer).oriented(orientation))
  }

  private static func perform(_ request: VNDetectBarcodesRequest, handler: VNImageRequestHandler, fallbackImage: CIImage) throws -> [QRVisionObservation] {
    do {
      try handler.perform([request])
    } catch {
      // Vision can fail to create an inference context, including in Simulator.
      // Still attempt actual pixel decoding with Core Image; never invent a result.
      let fallback = coreImageObservations(in: fallbackImage)
      if !fallback.isEmpty { return fallback }
      throw error
    }
    let observations = observations(from: request)
    return observations.isEmpty
      ? coreImageObservations(in: fallbackImage)
      : observations
  }

  private static func makeRequest() -> VNDetectBarcodesRequest {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    #if targetEnvironment(simulator)
    // Simulator has no device Neural Engine. Use supported CPU stages for real decoding.
    if let stages = try? request.supportedComputeStageDevices {
      for (stage, devices) in stages {
        if let cpu = devices.first(where: { if case .cpu = $0 { return true }; return false }) {
          request.setComputeDevice(cpu, for: stage)
        }
      }
    }
    #endif
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
