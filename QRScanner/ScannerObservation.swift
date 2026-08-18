import CoreGraphics
import Foundation
import UIKit

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
        clock: ScannerClock = SystemScannerClock()
    ) -> ScannerObservationSource {
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
            return VisionKitScannerObservationSource(clock: clock)
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
            return VisionKitScannerObservationSource(clock: clock)
        }
#else
        return VisionKitScannerObservationSource(clock: clock)
#endif
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
