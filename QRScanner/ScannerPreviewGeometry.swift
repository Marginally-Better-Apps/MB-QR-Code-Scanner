import AVFoundation
import CoreGraphics
import Foundation
import UIKit

enum ScannerRecognitionRegion {
    static let fullPreview = CGRect(x: 0, y: 0, width: 1, height: 1)

    static func containsVisibleCode(at bounds: CGRect) -> Bool {
        bounds.width > 0
            && bounds.height > 0
            && bounds.intersects(fullPreview)
    }
}

enum ScannerPreviewPresentation {
    static let aspectFillGravity = AVLayerVideoGravity.resizeAspectFill.rawValue
}

enum ScannerCaptureOrientation {
    static func videoOrientation(for interfaceOrientation: UIInterfaceOrientation) -> AVCaptureVideoOrientation {
        switch interfaceOrientation {
        case .portrait:
            .portrait
        case .portraitUpsideDown:
            .portraitUpsideDown
        case .landscapeLeft:
            .landscapeLeft
        case .landscapeRight:
            .landscapeRight
        default:
            .portrait
        }
    }
}

enum ScannerPresentation: Equatable {
    case visible
    case obscured
}

enum ScannerPreviewHitTarget: Equatable {
    case camera
    case resultAction
}

enum ScannerCameraInteractionRouter {
    static func hitTarget(at point: CGPoint, resultActionRect: CGRect?) -> ScannerPreviewHitTarget {
        if let resultActionRect, resultActionRect.contains(point) {
            return .resultAction
        }
        return .camera
    }

    static func zoomFactor(base: CGFloat, scale: CGFloat, min minFactor: CGFloat, max maxFactor: CGFloat) -> CGFloat {
        min(maxFactor, max(minFactor, base * scale))
    }
}

enum ScannerObservationMapper {
    nonisolated static func map(
        payload: String?,
        bounds: CGRect,
        viewSize: CGSize,
        timestamp: Date,
        engineID: ScannerEngineID
    ) -> ScannerObservation? {
        guard let payload else {
            return nil
        }

        let displayBounds = ScannerPreviewCoordinates.normalizedBounds(bounds, in: viewSize)
        guard ScannerRecognitionRegion.containsVisibleCode(at: displayBounds) else {
            return nil
        }

        return ScannerObservation(
            rawPayload: payload,
            displayBounds: displayBounds,
            timestamp: timestamp,
            engineID: engineID
        )
    }
}
