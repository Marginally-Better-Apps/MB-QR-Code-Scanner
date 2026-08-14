import AVFoundation
import Foundation

enum CameraAuthorization: CaseIterable {
    case notDetermined
    case authorized
    case denied
    case restricted
}

@MainActor
protocol CameraAccessProviding: AnyObject {
    var authorization: CameraAuthorization { get }
    var cameraAvailable: Bool { get }

    func requestAuthorization() async
    func refreshAuthorization()
}

extension CameraAccessProviding {
    func refreshAuthorization() {}
}

@MainActor
final class SystemCameraAccessProvider: CameraAccessProviding {
    var authorization: CameraAuthorization {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined:
            return .notDetermined
        case .authorized:
            return .authorized
        case .denied:
            return .denied
        case .restricted:
            return .restricted
        @unknown default:
            return .restricted
        }
    }

    var cameraAvailable: Bool {
        AVCaptureDevice.default(for: .video) != nil
    }

    func requestAuthorization() async {
        _ = await AVCaptureDevice.requestAccess(for: .video)
    }
}

@MainActor
enum CameraAccessProviderFactory {
    static func make(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        defaults: UserDefaults = .standard
    ) -> CameraAccessProviding {
#if DEBUG
        let commandLineFixture: String? = if
            let flagIndex = arguments.firstIndex(of: "--camera-fixture"),
            arguments.indices.contains(flagIndex + 1)
        {
            arguments[flagIndex + 1]
        } else {
            nil
        }

        guard let fixture = commandLineFixture ?? defaults.string(forKey: "cameraFixture") else {
            return SystemCameraAccessProvider()
        }

        switch fixture {
        case "not-determined":
            return CameraAccessFixtureProvider(authorization: .notDetermined)
        case "authorized":
            return CameraAccessFixtureProvider(authorization: .authorized)
        case "denied":
            return CameraAccessFixtureProvider(authorization: .denied)
        case "restricted":
            return CameraAccessFixtureProvider(authorization: .restricted)
        case "hardware-unavailable":
            return CameraAccessFixtureProvider(
                authorization: .notDetermined,
                cameraAvailable: false
            )
        case "recovering":
            return CameraAccessFixtureProvider(
                authorization: .denied,
                authorizationAfterRefresh: .authorized,
                refreshesBeforeRecovery: 1
            )
        default:
            return SystemCameraAccessProvider()
        }
#else
        return SystemCameraAccessProvider()
#endif
    }
}

#if DEBUG
@MainActor
private final class CameraAccessFixtureProvider: CameraAccessProviding {
    var authorization: CameraAuthorization
    let cameraAvailable: Bool

    private let authorizationAfterRefresh: CameraAuthorization?
    private var refreshesBeforeRecovery: Int

    init(
        authorization: CameraAuthorization,
        cameraAvailable: Bool = true,
        authorizationAfterRefresh: CameraAuthorization? = nil,
        refreshesBeforeRecovery: Int = 0
    ) {
        self.authorization = authorization
        self.cameraAvailable = cameraAvailable
        self.authorizationAfterRefresh = authorizationAfterRefresh
        self.refreshesBeforeRecovery = refreshesBeforeRecovery
    }

    func requestAuthorization() async {}

    func refreshAuthorization() {
        if refreshesBeforeRecovery > 0 {
            refreshesBeforeRecovery -= 1
            return
        }

        if let authorizationAfterRefresh {
            authorization = authorizationAfterRefresh
        }
    }
}
#endif

enum CameraAccessState: Equatable {
    case notDetermined
    case ready
    case denied
    case restricted
    case hardwareUnavailable

    static func resolve(
        authorization: CameraAuthorization,
        cameraAvailable: Bool
    ) -> CameraAccessState {
        guard cameraAvailable else {
            return .hardwareUnavailable
        }

        switch authorization {
        case .notDetermined:
            return .notDetermined
        case .authorized:
            return .ready
        case .denied:
            return .denied
        case .restricted:
            return .restricted
        }
    }
}
