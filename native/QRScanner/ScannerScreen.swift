import SwiftUI

struct ScannerScreen: View {
  @Bindable var model: ScannerModel
  @State private var detail: ScanPayload?
  @State private var route: ActionRoute?
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        Color.black.ignoresSafeArea()
        if model.cameraState == .ready {
          if model.fixtureName == nil {
            CameraPreview(model: model).ignoresSafeArea()
          } else {
            // Deterministic simulator scene for UI checks, never used by live capture.
            LinearGradient(colors: [.indigo.opacity(0.7), .black, .teal.opacity(0.5)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
          }
          DetectionHighlights(model: model).ignoresSafeArea().allowsHitTesting(false)
        } else {
          permissionView
        }
      }
      .overlay(alignment: .top) {
        HStack {
          if model.hasTorch && model.cameraState == .ready {
            Button { model.torchOn.toggle() } label: {
              Image(systemName: model.torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                .font(.system(size: 20)).frame(width: 44, height: 44)
                .contentTransition(.symbolEffect(.replace))
            }
            .modifier(NativeButton())
            .buttonBorderShape(.circle)
            .tint(model.torchOn ? .yellow : nil)
            .sensoryFeedback(.selection, trigger: model.torchOn)
            .accessibilityLabel("Flashlight")
            .accessibilityValue(model.torchOn ? Text("On") : Text("Off"))
            .accessibilityIdentifier("toggle-torch")
          }
          Spacer()
          NavigationLink {
            HistoryScreen(model: model)
          } label: {
            Image(systemName: "clock.arrow.circlepath").font(.system(size: 20)).frame(width: 44, height: 44)
          }
          .modifier(NativeButton())
          .buttonBorderShape(.circle)
          .accessibilityLabel("History")
          .accessibilityIdentifier("open-history")
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        Group {
          if model.cameraState == .ready {
            if model.results.isEmpty {
              ScanHint().transition(.opacity.combined(with: .scale(scale: 0.9)))
            } else {
              ResultsPanel(results: model.results, maxHeight: geometry.size.height * 0.38,
                onDetails: { detail = $0 }, onAction: { route = $0 }, onDismiss: { model.dismiss($0) })
                .frame(maxWidth: 540)
                .padding(.horizontal, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
          }
        }
        .padding(.bottom, 8)
        .animation(.snappy, value: model.results)
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .onAppear {
      model.showingHistory = false
      Task { await model.activate() }
    }
    .sheet(item: $detail) { ResultDetail(payload: $0) }
    .sheet(item: $route) { route in NativeActionSheet(route: route) }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background {
        detail = nil
        route = nil
      }
    }
  }

  @ViewBuilder private var permissionView: some View {
    Group {
      switch model.cameraState {
      case .requesting: ProgressView().tint(.white)
      case .denied:
        ContentUnavailableView {
          Label("Camera Access Is Off", systemImage: "camera")
        } description: {
          Text("Turn on camera access in Settings to scan codes. Camera frames never leave this device.")
        } actions: {
          Button("Open Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
            .controlSize(.large)
            .modifier(ProminentButton()).accessibilityIdentifier("camera-primary-action")
        }
      case .restricted:
        ContentUnavailableView("Camera Access Is Restricted", systemImage: "lock",
          description: Text("Camera use is limited on this device, for example by Screen Time or device management."))
      case .unavailable:
        ContentUnavailableView("Camera Unavailable", systemImage: "video.slash",
          description: Text("QR Scanner couldn’t find a camera to use. Your saved scans are still in History."))
      case .ready: EmptyView()
      }
    }
    .environment(\.colorScheme, .dark)
    .padding(24)
  }
}

private struct ScanHint: View {
  var body: some View {
    Label("Point at a QR code or barcode", systemImage: "qrcode.viewfinder")
      .font(.subheadline.weight(.medium))
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .modifier(NativeGlass(cornerRadius: 24))
      .accessibilityIdentifier("scan-hint")
  }
}

private struct DetectionHighlights: View {
  let model: ScannerModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var body: some View {
    GeometryReader { frame in
      ForEach(model.highlights) { detection in
        let width = detection.bounds.width * frame.size.width
        let height = detection.bounds.height * frame.size.height
        // A little breathing room keeps the outline off the code's own modules.
        let inset = min(10, max(4, min(width, height) * 0.08))
        RoundedRectangle(cornerRadius: min(14, max(6, min(width, height) * 0.14)), style: .continuous)
          .fill(.yellow.opacity(0.14))
          .stroke(.yellow, lineWidth: 3)
          .shadow(color: .black.opacity(0.3), radius: 4)
          .frame(width: width + inset * 2, height: height + inset * 2)
          .position(x: detection.bounds.midX * frame.size.width, y: detection.bounds.midY * frame.size.height)
          .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 1.15)))
          .accessibilityHidden(true)
          .accessibilityIdentifier("scanner-observation-bounds")
      }
    }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: model.highlights)
  }
}

struct CameraPreview: UIViewRepresentable {
  let model: ScannerModel
  func makeUIView(context: Context) -> ScannerPreviewView {
    let view = ScannerPreviewView(frame: .zero)
    view.onObservations = { [weak model] observations in
      model?.receive(observations)
    }
    return view
  }
  func updateUIView(_ view: ScannerPreviewView, context: Context) {
    if view.imageFixtureName != model.imageFixture { view.imageFixtureName = model.imageFixture }
    if view.running != model.isCapturing { view.running = model.isCapturing }
    if view.torchEnabled != model.torchOn { view.torchEnabled = model.torchOn }
  }
  static func dismantleUIView(_ view: ScannerPreviewView, coordinator: ()) { view.running = false }
}

struct NativeButton: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) { content.buttonStyle(.glass) }
    else { content.buttonStyle(.bordered) }
  }
}

struct NativeGlass: ViewModifier {
  var cornerRadius: CGFloat = 28
  var interactive = false
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  func body(content: Content) -> some View {
    if reduceTransparency {
      content.background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: cornerRadius))
    } else if #available(iOS 26.0, *) {
      content.glassEffect(.regular.interactive(interactive), in: .rect(cornerRadius: cornerRadius))
    } else {
      content.background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
    }
  }
}
