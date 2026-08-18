import CoreGraphics
import Foundation
import UIKit
import VisionKit

struct ScannerEngineID: RawRepresentable, Hashable, Sendable {
    let rawValue: String

    init(_ rawValue: String) {
        self.rawValue = rawValue
    }

    init(rawValue: String) {
        self.rawValue = rawValue
    }
}

struct ScannerObservation: Equatable, Sendable {
    let rawPayload: String
    let displayBounds: CGRect
    let timestamp: Date
    let engineID: ScannerEngineID
}

protocol ScannerClock {
    var now: Date { get }
}

struct SystemScannerClock: ScannerClock {
    var now: Date { Date() }
}

enum ScannerLifecyclePhase: Equatable {
    case active
    case background
}

@MainActor
protocol ScannerObservationSource: AnyObject {
    var engineID: ScannerEngineID { get }
    var previewController: UIViewController? { get }

    func start(receiveFrame: @escaping ([ScannerObservation]) -> Void)
    func stop()
    func handleLifecycle(_ phase: ScannerLifecyclePhase)
}

extension ScannerObservationSource {
    var previewController: UIViewController? { nil }

    func handleLifecycle(_ phase: ScannerLifecyclePhase) {}
}

enum ScannerEngineKind: Equatable {
    case visionKit
    case avFoundation
}

struct ScannerEngineDecision: Equatable {
    var engine: ScannerEngineKind
    var startsCapture: Bool
}

enum ScannerEngineSelector {
    static func decide(
        dataScannerSupported: Bool,
        dataScannerAvailable: Bool,
        authorization: CameraAuthorization
    ) -> ScannerEngineDecision {
        let engine: ScannerEngineKind = dataScannerSupported ? .visionKit : .avFoundation
        let isAuthorized = authorization == .authorized
        let startsCapture: Bool
        switch engine {
        case .visionKit:
            startsCapture = isAuthorized && dataScannerAvailable
        case .avFoundation:
            startsCapture = isAuthorized
        }
        return ScannerEngineDecision(engine: engine, startsCapture: startsCapture)
    }
}

enum ScannerPreviewCoordinates {
    static func normalizedBounds(_ bounds: CGRect, in viewSize: CGSize) -> CGRect {
        guard viewSize.width > 0, viewSize.height > 0 else {
            return .zero
        }

        return CGRect(
            x: bounds.origin.x / viewSize.width,
            y: bounds.origin.y / viewSize.height,
            width: bounds.size.width / viewSize.width,
            height: bounds.size.height / viewSize.height
        )
    }
}

@MainActor
final class IdleScannerObservationSource: ScannerObservationSource {
    let engineID = ScannerEngineID("idle")

    func start(receiveFrame: @escaping ([ScannerObservation]) -> Void) {}
    func stop() {}
}

@MainActor
enum ScannerObservationSourceFactory {
    static func make(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        defaults: UserDefaults = .standard,
        fixturesEnabled: Bool = buildAllowsFixtures,
        clock: ScannerClock = SystemScannerClock(),
        dataScannerSupported: Bool? = nil,
        authorization: CameraAuthorization? = nil
    ) -> ScannerObservationSource {
        let dataScannerSupported = dataScannerSupported ?? DataScannerViewController.isSupported
#if DEBUG
        let commandLineFixture: String? = if
            let flagIndex = arguments.firstIndex(of: "--scanner-fixture"),
            arguments.indices.contains(flagIndex + 1)
        {
            arguments[flagIndex + 1]
        } else {
            nil
        }

        guard
            fixturesEnabled,
            let fixture = commandLineFixture ?? defaults.string(forKey: "scannerFixture")
        else {
            return makeLiveSource(
                clock: clock,
                dataScannerSupported: dataScannerSupported,
                authorization: authorization
            )
        }

        switch fixture {
        case "single-code":
            return ScannerObservationFixtureSource(
                engineID: ScannerEngineID("fixture.single-code"),
                clock: clock,
                startupFrame: [
                    ScannerFixtureDetection(
                        rawPayload: "https://example.com/fixture",
                        displayBounds: CGRect(x: 0.2, y: 0.3, width: 0.6, height: 0.25)
                    )
                ]
            )
        default:
            return makeLiveSource(
                clock: clock,
                dataScannerSupported: dataScannerSupported,
                authorization: authorization
            )
        }
#else
        return makeLiveSource(
            clock: clock,
            dataScannerSupported: dataScannerSupported,
            authorization: authorization
        )
#endif
    }

    private static func makeLiveSource(
        clock: ScannerClock,
        dataScannerSupported: Bool,
        authorization: CameraAuthorization?
    ) -> ScannerObservationSource {
        switch ScannerEngineSelector.decide(
            dataScannerSupported: dataScannerSupported,
            dataScannerAvailable: true,
            authorization: authorization ?? .authorized
        ).engine {
        case .visionKit:
            return VisionKitScannerObservationSource(clock: clock)
        case .avFoundation:
            return AVFoundationScannerObservationSource(
                platform: SystemAVFoundationScannerPlatform(authorizationOverride: authorization),
                clock: clock
            )
        }
    }

    nonisolated private static var buildAllowsFixtures: Bool {
#if DEBUG
        true
#else
        false
#endif
    }
}

#if DEBUG
struct ScannerFixtureDetection: Equatable {
    let rawPayload: String
    let displayBounds: CGRect
}

@MainActor
final class ScannerObservationFixtureSource: ScannerObservationSource {
    let engineID: ScannerEngineID

    private let clock: ScannerClock
    private let startupFrame: [ScannerFixtureDetection]?
    private var receiveFrame: (([ScannerObservation]) -> Void)?

    init(
        engineID: ScannerEngineID,
        clock: ScannerClock,
        startupFrame: [ScannerFixtureDetection]? = nil
    ) {
        self.engineID = engineID
        self.clock = clock
        self.startupFrame = startupFrame
    }

    func start(receiveFrame: @escaping ([ScannerObservation]) -> Void) {
        self.receiveFrame = receiveFrame
        if let startupFrame {
            emit(startupFrame)
        }
    }

    func stop() {
        receiveFrame = nil
    }

    func emit(_ detections: [ScannerFixtureDetection]) {
        let timestamp = clock.now
        receiveFrame?(
            detections.map {
                ScannerObservation(
                    rawPayload: $0.rawPayload,
                    displayBounds: $0.displayBounds,
                    timestamp: timestamp,
                    engineID: engineID
                )
            }
        )
    }
}
#endif
