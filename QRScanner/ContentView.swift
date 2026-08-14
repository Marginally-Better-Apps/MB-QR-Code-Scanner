import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var appState: AppState

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            NavigationStack {
                ScannerView(session: appState.scannerSession)
            }
            .tabItem {
                Label("Scanner", systemImage: "qrcode.viewfinder")
            }
            .tag(AppTab.scanner)

            NavigationStack {
                HistoryView(session: appState.scannerSession)
            }
            .tabItem {
                Label("History", systemImage: "clock")
            }
            .tag(AppTab.history)
        }
        .tabViewStyle(.automatic)
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                appState.scannerSession.resumeFromSettings()
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
                ContentUnavailableView(
                    "Ready to Scan",
                    systemImage: "qrcode.viewfinder",
                    description: Text(
                        "Point the camera at a QR code. Scanning starts automatically."
                    )
                )
            }
        }
        .navigationTitle("Scanner")
        .task {
            await session.activateScanner()
        }
    }
}

private struct HistoryView: View {
    let session: ScannerSessionStore

    var body: some View {
        ContentUnavailableView(
            "History",
            systemImage: "clock",
            description: Text("Your scan history will appear here.")
        )
        .navigationTitle("History")
    }
}

#Preview {
    ContentView(appState: AppState())
}
