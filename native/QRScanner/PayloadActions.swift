import SwiftUI

enum PayloadAction: Hashable {
  case open, lookup, addContact, addEvent, copyPassword, copy, share
}

extension ScanPayload {
  var kindName: String { Self.kindName(kind) }

  var subtitle: String { "\(kindName) · \(format.name)" }

  /// The one action a person most likely wants, offered next to each result.
  var primaryAction: PayloadAction? {
    if openURL != nil { return .open }
    if productCode != nil { return .lookup }
    if kind == .contact { return .addContact }
    if kind == .calendar { return .addEvent }
    if let wifi, !wifi.password.isEmpty { return .copyPassword }
    return isSensitive ? nil : .copy
  }

  var needsPaymentConfirmation: Bool {
    kind == .customScheme && original.localizedCaseInsensitiveContains("pay")
  }

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
      case .auth: original.lowercased().hasPrefix("fido:") ? "Connect nearby device" : "Open Passwords"
      case .customScheme: "Open App Link"
      default: "Open Link"
      }
    case .lookup: "Look Up Product"
    case .addContact: "Add Contact"
    case .addEvent: "Add Event"
    case .copyPassword: "Copy Password"
    case .copy: "Copy"
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

  static func copy(_ text: String) {
    UIPasteboard.general.setItems([["public.utf8-plain-text": text]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
  }
}

/// Owns the confirmation, failure, and product-lookup state behind every payload action.
struct PayloadActionHost<Content: View>: View {
  let payload: ScanPayload
  let onAction: (ActionRoute) -> Void
  @ViewBuilder let content: (_ perform: @escaping (PayloadAction) -> Void) -> Content
  @Environment(\.showToast) private var showToast
  @State private var openFailed = false
  @State private var confirmPayment = false
  @State private var showProduct = false

  var body: some View {
    content(perform)
      .alert("This action is unavailable.", isPresented: $openFailed) { Button("OK", role: .cancel) {} }
      .confirmationDialog("Verify this payment in the destination app before paying.", isPresented: $confirmPayment, titleVisibility: .visible) {
        Button("Open App Link", action: open)
        Button("Cancel", role: .cancel) {}
      }
      .sheet(isPresented: $showProduct) {
        if let code = payload.productCode { ProductLookupScreen(code: code) }
      }
  }

  private func perform(_ action: PayloadAction) {
    switch action {
    case .open: if payload.needsPaymentConfirmation { confirmPayment = true } else { open() }
    case .lookup: showProduct = true
    case .addContact: onAction(ActionRoute(kind: .contact, payload: payload))
    case .addEvent: onAction(ActionRoute(kind: .calendar, payload: payload))
    case .copyPassword:
      ScanPayload.copy(payload.wifi?.password ?? "")
      showToast(String(localized: "Password Copied"))
    case .copy:
      ScanPayload.copy(payload.original)
      showToast(String(localized: "Copied"))
    case .share: onAction(ActionRoute(kind: .share, payload: payload))
    }
  }

  private func open() {
    guard let url = payload.openURL else { return }
    UIApplication.shared.open(url, options: [:]) { succeeded in
      if !succeeded { openFailed = true }
    }
  }
}

extension EnvironmentValues {
  @Entry var showToast: (String) -> Void = { _ in }
}

extension View {
  /// Confirms quick actions such as Copy for sighted users; VoiceOver hears an announcement.
  func toastHost() -> some View { modifier(ToastHost()) }
}

private struct ToastHost: ViewModifier {
  @State private var message: String?
  @State private var generation = 0

  func body(content: Content) -> some View {
    content
      .environment(\.showToast) { text in
        generation += 1
        let current = generation
        withAnimation(.snappy) { message = text }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        UIAccessibility.post(notification: .announcement, argument: text)
        Task { @MainActor in
          try? await Task.sleep(for: .seconds(2))
          guard generation == current else { return }
          withAnimation(.smooth) { message = nil }
        }
      }
      .overlay(alignment: .top) {
        if let message {
          Label { Text(message) } icon: { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .modifier(NativeGlass(cornerRadius: 24))
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .allowsHitTesting(false)
            .accessibilityIdentifier("toast")
        }
      }
  }
}

struct ProminentButton: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) { content.buttonStyle(.glassProminent) }
    else { content.buttonStyle(.borderedProminent) }
  }
}
