import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct ScannerScreen: View {
  @Bindable var model: ScannerViewModel
  @State private var detail: ScanPayload?
  @State private var route: ActionRoute?
  @State private var photoImport = PhotoImportController()
  @State private var selectedPhoto: PhotosPickerItem?
  @State private var showingPhotos = false
  @State private var dropTargeted = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        Color.black.ignoresSafeArea()
        if let photo = model.photo {
          PhotoResult(photo: photo, highlights: model.photoHighlights, title: { model.payload(for: $0).title }) {
            detail = model.payload(for: $0)
          }
          // Clear the floating buttons; the results panel is already a bottom inset.
          .padding(.top, 68).padding([.horizontal, .bottom], 16)
          .transition(.opacity)
        } else if model.cameraState == .ready {
          if !model.usesSimulatedScene {
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
          if model.showingPhotoResults {
            Button { model.resumeCamera() } label: {
              Image(systemName: "xmark").font(.system(size: 20, weight: .medium)).frame(width: 44, height: 44)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .modifier(NativeGlass(cornerRadius: 22, interactive: true))
            .accessibilityLabel("Back to Camera")
            .accessibilityIdentifier("resume-camera")
          } else if model.hasTorch && model.cameraState == .ready {
            Button { model.torchOn.toggle() } label: {
              Image(systemName: model.torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                .font(.system(size: 20)).frame(width: 44, height: 44)
                .foregroundStyle(model.torchOn ? AnyShapeStyle(.yellow) : AnyShapeStyle(.primary))
                .contentTransition(.symbolEffect(.replace))
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .modifier(NativeGlass(cornerRadius: 22, interactive: true))
            .sensoryFeedback(.selection, trigger: model.torchOn)
            .accessibilityLabel("Flashlight")
            .accessibilityValue(model.torchOn ? Text("On") : Text("Off"))
            .accessibilityIdentifier("toggle-torch")
          }
          Spacer()
          HStack(spacing: 0) {
            Button {
              selectedPhoto = nil
              model.beginPhotoImport()
              showingPhotos = true
            } label: {
              Image(systemName: "photo").font(.system(size: 20)).frame(width: 48, height: 44)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("Scan a Photo")
            .accessibilityIdentifier("open-photos")
            .disabled(photoImport.isLoading)
            Divider().frame(height: 20)
            Button { model.showingHistory = true } label: {
              Image(systemName: "clock.arrow.circlepath").font(.system(size: 20)).frame(width: 48, height: 44)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("History")
            .accessibilityIdentifier("open-history")
          }
          .buttonStyle(.plain)
          .modifier(NativeGlass(cornerRadius: 24, interactive: true))
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        ZStack(alignment: .bottom) {
          if model.cameraState == .ready || model.showingPhotoResults || !model.results.isEmpty {
            let empty = model.results.isEmpty
            if empty && !model.showingPhotoResults {
              ScanHint().transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.9)))
            }
            // Stays mounted when empty so a sheet or dialog opened from a result survives the
            // last result being dismissed or cleared.
            ResultsPanel(results: model.results, maxHeight: geometry.size.height * 0.38,
              onDetails: { detail = $0 }, onAction: { route = $0 }, onDismiss: { model.dismiss($0) })
              .frame(maxWidth: 540)
              .padding(.horizontal, 16)
              .opacity(empty ? 0 : 1)
              .offset(y: empty && !reduceMotion ? 40 : 0)
              .allowsHitTesting(!empty)
              .accessibilityHidden(empty)
          }
        }
        .padding(.bottom, 8)
        // A photo sits on black, where light glass turns a muddy gray.
        .environment(\.colorScheme, model.showingPhotoResults ? .dark : colorScheme)
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .snappy, value: model.results)
      }
      .animation(.easeInOut(duration: 0.2), value: model.showingPhotoResults)
      .overlay {
        if photoImport.isLoading {
          VStack(spacing: 12) {
            ProgressView("Reading Photo")
            Button("Cancel") { photoImport.cancel(model) }
          }
          .padding(24).modifier(NativeGlass())
        } else if dropTargeted {
          Label("Drop a photo to scan", systemImage: "photo")
            .padding(24).modifier(NativeGlass())
            .allowsHitTesting(false)
        }
      }
      .onDrop(of: [UTType.image], isTargeted: $dropTargeted) { photoImport.drop($0, into: model) }
    }
    #if DEBUG || targetEnvironment(simulator)
    .overlay(alignment: .leading) {
      if model.usesSimulatedScene { FixtureControls(model: model).padding(.leading, 8) }
    }
    #endif
    .toolbar(.hidden, for: .navigationBar)
    .navigationDestination(isPresented: $model.showingHistory) {
      HistoryScreen(model: model.history, scanner: model)
    }
    .photosPicker(isPresented: $showingPhotos, selection: $selectedPhoto, matching: .images, preferredItemEncoding: .current)
    .onChange(of: selectedPhoto) { _, photo in
      if let photo { photoImport.load(photo, into: model) }
    }
    .onChange(of: showingPhotos) { _, showing in
      if !showing && selectedPhoto == nil && !photoImport.isLoading { model.cancelPhotoImport() }
    }
    .alert("Photo Scan", isPresented: Binding(get: { photoImport.failure != nil }, set: { if !$0 { photoImport.failure = nil } })) {
      Button("OK", role: .cancel) {}
    } message: {
      if photoImport.failure == .noCodes { Text("No QR codes or barcodes were found in this photo. Try a clearer image.") }
      else { Text("This image couldn’t be read. Try another photo.") }
    }
    .sheet(item: $detail) { ResultDetail(payload: $0) }
    .sheet(item: $route) { route in NativeActionSheet(route: route) }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background {
        photoImport.cancel(model)
        selectedPhoto = nil
        showingPhotos = false
        photoImport.failure = nil
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
  let model: ScannerViewModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var body: some View {
    GeometryReader { frame in
      ForEach(model.highlights) { detection in
        let width = detection.bounds.width * frame.size.width
        let height = detection.bounds.height * frame.size.height
        CodeOutline(size: CGSize(width: width, height: height))
          .position(x: detection.bounds.midX * frame.size.width, y: detection.bounds.midY * frame.size.height)
          .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 1.15)))
          .accessibilityHidden(true)
          .accessibilityIdentifier("scanner-observation-bounds")
      }
    }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: model.highlights)
  }
}

/// The yellow outline drawn around a found code, live or in a photo.
private struct CodeOutline: View {
  let size: CGSize

  var body: some View {
    let side = min(size.width, size.height)
    // A little breathing room keeps the outline off the code's own modules.
    let inset = min(10, max(4, side * 0.08))
    RoundedRectangle(cornerRadius: min(14, max(6, side * 0.14)), style: .continuous)
      .fill(.yellow.opacity(0.14))
      .stroke(.yellow, lineWidth: 3)
      .shadow(color: .black.opacity(0.3), radius: 4)
      .frame(width: size.width + inset * 2, height: size.height + inset * 2)
  }
}

/// An imported photo with each code it contains outlined. Tapping an outline shows that code's details.
private struct PhotoResult: View {
  let photo: ImportedPhoto
  let highlights: [Detection]
  let title: (Detection) -> String
  let onSelect: (Detection) -> Void
  @State private var outlined = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Image(decorative: photo.image, scale: 1)
      .resizable()
      .aspectRatio(contentMode: .fit)
      .clipShape(.rect(cornerRadius: 20, style: .continuous))
      .overlay {
        // The fitted image fills this frame exactly, so normalized bounds map straight onto it.
        GeometryReader { frame in
          ForEach(highlights) { detection in
            Button { onSelect(detection) } label: {
              CodeOutline(size: CGSize(width: detection.bounds.width * frame.size.width,
                height: detection.bounds.height * frame.size.height))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .scaleEffect(outlined || reduceMotion ? 1 : 1.15)
            .opacity(outlined ? 1 : 0)
            .position(x: detection.bounds.midX * frame.size.width, y: detection.bounds.midY * frame.size.height)
            .accessibilityLabel(Text(verbatim: title(detection)))
            .accessibilityHint("Shows details")
            .accessibilityIdentifier("photo-code-outline")
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Scanned Photo")
      .onAppear {
        withAnimation(reduceMotion ? .easeIn(duration: 0.2) : .snappy.delay(0.15)) { outlined = true }
      }
  }
}
