import SwiftUI

extension ScanPayload {
  var kindName: String { Self.kindName(kind) }

  var subtitle: String { "\(kindName) · \(format.name)" }

  static func kindName(_ kind: Kind) -> String {
    switch kind {
    case .url: String(localized: "Link")
    case .text: String(localized: "Text")
    case .email: String(localized: "Email")
    case .phone: String(localized: "Phone Number")
    case .sms: String(localized: "Text Message")
    case .geo: String(localized: "Location")
    case .contact: String(localized: "Contact")
    case .calendar: String(localized: "Event")
    case .wifi: String(localized: "Wi-Fi")
    case .auth: String(localized: "Sign-In")
    case .authExport: String(localized: "Authenticator Export")
    case .customScheme: String(localized: "App Link")
    case .product: String(localized: "Product")
    case .boardingPass: String(localized: "Boarding Pass")
    }
  }

  func title(for action: PayloadAction) -> LocalizedStringKey {
    switch action {
    case .open:
      switch kind {
      case .email: "Compose"
      case .phone: "Call"
      case .sms: "Message"
      case .geo: "Open Map"
      case .auth: PayloadActionRules.handoff(for: self) == .passkey ? "Connect nearby device" : "Open Passwords"
      case .customScheme: "Open App Link"
      default: "Open Link"
      }
    case .lookup: "Look Up Product"
    case .addContact: "Add Contact"
    case .addEvent: "Add Event"
    case .copyPassword: "Copy Password"
    case .copy: kind == .wifi ? "Copy Network Name" : "Copy"
    case .share: "Share"
    }
  }

  func symbol(for action: PayloadAction) -> String {
    switch action {
    case .open:
      switch kind {
      case .url: "safari"
      case .email: "envelope"
      case .phone: "phone"
      case .sms: "message"
      case .geo: "map"
      case .auth, .authExport: "key"
      default: "arrow.up.forward.app"
      }
    case .lookup: "magnifyingglass"
    case .addContact: "person.crop.circle.badge.plus"
    case .addEvent: "calendar.badge.plus"
    case .copyPassword: "key"
    case .copy: "doc.on.doc"
    case .share: "square.and.arrow.up"
    }
  }

  /// Copies stay on this device and expire, so a scanned code never syncs through Universal Clipboard.
  static func copy(_ text: String) {
    UIPasteboard.general.setItems([["public.utf8-plain-text": text]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
  }
}

extension OpenUnavailableReason {
  var explanation: LocalizedStringKey {
    switch self {
    case .appNotInstalled: "App not installed. Copy or share the link instead."
    case .passkey: "The Camera app can still handle passkey QR codes."
    case .authenticator: "No app on this device handles authenticator links."
    }
  }
}

/// What every result inside a `payloadActionHost` uses to list and run its actions.
struct PayloadActionContext {
  var perform: (PayloadAction, ScanPayload) -> Void = { _, _ in }
  /// Payloads whose open already failed this session, so Open is replaced by an explanation.
  var unopenable: Set<String> = []

  @MainActor func actions(for payload: ScanPayload) -> PayloadActionSet {
    let availability = unopenable.contains(payload.id) ? .unavailable : URLOpenAvailability.check(payload)
    return PayloadActionRules.actions(for: payload, availability: availability)
  }
}

extension EnvironmentValues {
  @Entry var payloadActions = PayloadActionContext()
}

extension View {
  /// Owns confirmation, failure, and product-lookup presentation for every result inside. Each presentation keeps
  /// its own snapshot of the payload, so it survives the result row disappearing when the camera sees a new code.
  func payloadActionHost(onAction: @escaping (ActionRoute) -> Void) -> some View {
    modifier(PayloadActionHost(onAction: onAction))
  }
}

private struct PendingOpen {
  let payload: ScanPayload
  let handoff: OpenHandoff

  var title: Text {
    switch handoff {
    case .appLink(_, _, true): Text("Open Payment Link?")
    case .appLink: Text("Open in Another App?")
    case .authenticator: Text("Send Setup Code to an Authenticator?")
    case .passkey: Text("Connect a Nearby Device?")
    case .direct: Text(payload.title(for: .open))
    }
  }

  var message: Text {
    switch handoff {
    case .appLink(let scheme, let target, let isPayment):
      (isPayment ? Text("Verify this payment in the destination app before paying.") : Text("The app that handles “\(scheme)” links will open:"))
        + Text(verbatim: "\n\n" + target)
    case .authenticator: Text("The setup code will be sent to the app that handles authenticator links.")
    case .passkey: Text("The system will ask to connect to the nearby device. Bluetooth must be on.")
    case .direct: Text(verbatim: "")
    }
  }
}

private struct OpenFailure {
  let reason: OpenUnavailableReason?
}

private struct ProductRequest: Identifiable {
  let code: String
  var id: String { code }
}

private struct PayloadActionHost: ViewModifier {
  let onAction: (ActionRoute) -> Void
  @Environment(\.showToast) private var showToast
  @State private var pendingOpen: PendingOpen?
  @State private var confirmingOpen = false
  @State private var failure: OpenFailure?
  @State private var showingFailure = false
  @State private var product: ProductRequest?
  @State private var unopenable: Set<String> = []

  func body(content: Content) -> some View {
    content
      .environment(\.payloadActions, PayloadActionContext(perform: perform, unopenable: unopenable))
      .confirmationDialog(pendingOpen?.title ?? Text(verbatim: ""), isPresented: $confirmingOpen, titleVisibility: .visible, presenting: pendingOpen) { pending in
        Button(pending.payload.title(for: .open)) { open(pending.payload) }
        Button("Cancel", role: .cancel) {}
      } message: { pending in
        pending.message
      }
      .alert("This action is unavailable.", isPresented: $showingFailure, presenting: failure) { _ in
        Button("OK", role: .cancel) {}
      } message: { failure in
        if let reason = failure.reason { Text(reason.explanation) }
      }
      .sheet(item: $product) { ProductLookupScreen(code: $0.code) }
  }

  private func perform(_ action: PayloadAction, on payload: ScanPayload) {
    switch action {
    case .open:
      guard let handoff = PayloadActionRules.handoff(for: payload) else { return }
      if handoff.needsConfirmation {
        pendingOpen = PendingOpen(payload: payload, handoff: handoff)
        confirmingOpen = true
      } else {
        open(payload)
      }
    case .lookup:
      if let code = payload.productCode { product = ProductRequest(code: code) }
    case .addContact: onAction(ActionRoute(kind: .contact, payload: payload))
    case .addEvent: onAction(ActionRoute(kind: .calendar, payload: payload))
    case .copyPassword, .copy:
      guard let text = PayloadActionRules.clipboardText(for: action, payload: payload) else { return }
      ScanPayload.copy(text)
      showToast(action == .copyPassword ? String(localized: "Password Copied")
        : payload.kind == .wifi ? String(localized: "Network Name Copied") : String(localized: "Copied"))
    case .share: onAction(ActionRoute(kind: .share, payload: payload))
    }
  }

  private func open(_ payload: ScanPayload) {
    guard let url = payload.openURL else { return }
    UIApplication.shared.open(url, options: [:]) { succeeded in
      guard !succeeded else { return }
      let reason = PayloadActionRules.unavailableReason(for: payload)
      if reason != nil { unopenable.insert(payload.id) }
      failure = OpenFailure(reason: reason)
      showingFailure = true
    }
  }
}
