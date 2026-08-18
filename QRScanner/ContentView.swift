import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var appState: AppState

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            ScannerView(session: appState.scannerSession)
                .tabItem {
                    Label("Scanner", systemImage: "qrcode.viewfinder")
                }
                .tag(AppTab.scanner)

            HistoryView(session: appState.scannerSession)
                .tabItem {
                    Label("History", systemImage: "clock")
                }
                .tag(AppTab.history)
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                appState.scannerSession.handleLifecycle(.active)
            case .background:
                appState.scannerSession.handleLifecycle(.background)
            default:
                break
            }
        }
    }
}

private struct ScannerView: View {
    @Environment(\.openURL) private var openURL
    @ObservedObject var session: ScannerSessionStore

    var body: some View {
        Group {
            switch session.cameraAccessState {
            case .notDetermined:
                ContentUnavailableView(
                    "Camera Access",
                    systemImage: "camera",
                    description: Text(
                        "QR Scanner recognizes QR codes on this device. Camera frames are never uploaded or saved."
                    )
                )
            case .denied:
                ContentUnavailableView {
                    Label("Camera Access Is Off", systemImage: "camera.badge.ellipsis")
                } description: {
                    Text("Allow camera access in Settings to scan QR codes.")
                } actions: {
                    Button("Open Settings") {
                        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else {
                            return
                        }
                        openURL(settingsURL)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("camera-primary-action")
                }
            case .restricted:
                ContentUnavailableView(
                    "Camera Access Is Restricted",
                    systemImage: "camera.badge.ellipsis",
                    description: Text(
                        "Camera access is restricted by Screen Time or device management."
                    )
                )
            case .hardwareUnavailable:
                ContentUnavailableView(
                    "Camera Unavailable",
                    systemImage: "camera.fill",
                    description: Text("No camera is available on this device.")
                )
            case .ready:
                if let previewController = session.previewController {
                    ScannerCameraPreview(controller: previewController)
                        .ignoresSafeArea()
                        .onAppear {
                            session.handleLifecycle(.active)
                        }
                        .overlay(alignment: .bottom) {
                            if !session.visibleObservations.isEmpty {
                                observationList
                                    .padding()
                                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                                    .padding()
                            }
                        }
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel("Live camera scan area")
                } else if session.visibleObservations.isEmpty {
                    ContentUnavailableView(
                        "Ready to Scan",
                        systemImage: "qrcode.viewfinder",
                        description: Text(
                            "Point the camera at a QR code. Scanning starts automatically."
                        )
                    )
                } else {
                    observationList
                }
            }
        }
        .task {
            await session.activateScanner()
        }
    }

    private var observationList: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "qrcode.viewfinder")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)

                Text("Observed QR Code")
                    .font(.title2.bold())

                ForEach(
                    Array(session.visibleObservations.enumerated()),
                    id: \.offset
                ) { _, observation in
                    Text(observation.rawPayload)
                        .font(.body.monospaced())
                        .multilineTextAlignment(.center)
                        .textSelection(.enabled)
                        .accessibilityIdentifier("scanner-observation-payload")
                }
            }
            .frame(maxWidth: .infinity)
            .padding()
        }
    }
}

private struct ScannerCameraPreview: UIViewControllerRepresentable {
    let controller: UIViewController

    func makeUIViewController(context: Context) -> UIViewController {
        controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

private struct HistoryView: View {
    let session: ScannerSessionStore

    var body: some View {
        ContentUnavailableView(
            "History",
            systemImage: "clock",
            description: Text("Your scan history will appear here.")
        )
    }
}

#Preview {
    ContentView(appState: AppState())
}
