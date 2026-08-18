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
            case .inactive:
                appState.scannerSession.handleLifecycle(.inactive)
            case .background:
                appState.scannerSession.handleLifecycle(.background)
            default:
                break
            }
        }
        .onChange(of: appState.selectedTab) { _, tab in
            appState.scannerSession.handlePresentation(tab == .scanner ? .visible : .obscured)
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
                            session.handlePresentation(.visible)
                        }
                        .overlay {
                            observationBoundsOverlay
                        }
                        .safeAreaInset(edge: .bottom, spacing: 0) {
                            if !session.visibleObservations.isEmpty {
                                observationList
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

    private var observationBoundsOverlay: some View {
        GeometryReader { geometry in
            ForEach(Array(session.visibleObservations.enumerated()), id: \.offset) { _, observation in
                let rect = CGRect(
                    x: observation.displayBounds.origin.x * geometry.size.width,
                    y: observation.displayBounds.origin.y * geometry.size.height,
                    width: observation.displayBounds.width * geometry.size.width,
                    height: observation.displayBounds.height * geometry.size.height
                )
                Rectangle()
                    .stroke(.yellow, lineWidth: 2)
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
                    .accessibilityIdentifier("scanner-observation-bounds")
                    .accessibilityHidden(true)
            }
        }
        .allowsHitTesting(false)
    }

    private var observationList: some View {
        VStack(spacing: 8) {
            ForEach(
                Array(session.visibleObservations.enumerated()),
                id: \.offset
            ) { _, observation in
                ObservationResultBar(payload: observation.rawPayload)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}

private struct ObservationResultBar: View {
    let payload: String
    @State private var didCopy = false
    @State private var copyCount = 0

    var body: some View {
        HStack(spacing: 0) {
            Text(payload)
                .font(.subheadline)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 14)
                .padding(.trailing, 8)
                .accessibilityIdentifier("scanner-observation-payload")

            Rectangle()
                .fill(.separator)
                .frame(width: 1)
                .padding(.vertical, 8)

            Button(action: copyPayload) {
                Image(systemName: didCopy ? "checkmark" : "doc.on.clipboard")
                    .font(.body.weight(.medium))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Copy")
            .accessibilityIdentifier("scanner-observation-copy")
        }
        .frame(minHeight: 44)
        .foregroundStyle(.primary)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .sensoryFeedback(.success, trigger: copyCount)
    }

    private func copyPayload() {
        UIPasteboard.general.string = payload
        copyCount += 1
        didCopy = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.5))
            didCopy = false
        }
    }
}

private struct ScannerCameraPreview: UIViewControllerRepresentable {
    let controller: UIViewController

    func makeUIViewController(context: Context) -> UIViewController {
        controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        uiViewController.view.setNeedsLayout()
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
    }
}

#Preview {
    ContentView(appState: AppState())
}
