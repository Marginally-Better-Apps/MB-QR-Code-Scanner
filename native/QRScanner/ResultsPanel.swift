import SwiftUI

struct ResultsPanel: View {
  let results: [ScanPayload]
  let maxHeight: CGFloat
  let onDetails: (ScanPayload) -> Void
  let onAction: (ActionRoute) -> Void
  let onDismiss: (ScanPayload) -> Void
  @ScaledMetric(relativeTo: .body) private var rowHeight = 60.0

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        ForEach(Array(results.enumerated()), id: \.element.id) { index, payload in
          if index > 0 { Divider().padding(.leading, 32) }
          ResultMenu(payload: payload, onDetails: { onDetails(payload) }, onAction: onAction, onDismiss: { onDismiss(payload) }) {
            HStack(spacing: 12) {
              Image(systemName: payload.symbol).frame(width: 20)
              Text(payload.title).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
              Image(systemName: "ellipsis").foregroundStyle(.secondary)
            }
            .font(.body)
            .frame(minHeight: rowHeight)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(payload.title)
          .accessibilityIdentifier("scan-result-row")
        }
      }.padding(.horizontal, 18).padding(.vertical, 6)
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: min(CGFloat(results.count) * rowHeight + 12, maxHeight))
    .clipShape(.rect(cornerRadius: 28))
    .modifier(NativeGlass())
    .accessibilityIdentifier("scan-results-panel")
  }
}

struct ResultActions: View {
  let payload: ScanPayload
  var onDetails: (() -> Void)?
  let onAction: (ActionRoute) -> Void
  let onOpen: () -> Void

  var body: some View {
    Group {
      if payload.openURL != nil {
        Button(openLabel, systemImage: "arrow.up.right.square", action: onOpen)
      }
      if payload.kind == .contact {
        Button("Add Contact", systemImage: "person.crop.circle.badge.plus") { onAction(ActionRoute(kind: .contact, payload: payload)) }
      }
      if payload.kind == .calendar {
        Button("Add Event", systemImage: "calendar.badge.plus") { onAction(ActionRoute(kind: .calendar, payload: payload)) }
      }
      if !payload.isSensitive {
        Button("Copy", systemImage: "doc.on.doc") {
          UIPasteboard.general.setItems([["public.utf8-plain-text": payload.original]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
          UIAccessibility.post(notification: .announcement, argument: NSLocalizedString("Copied", comment: ""))
        }
        Button("Share", systemImage: "square.and.arrow.up") { onAction(ActionRoute(kind: .share, payload: payload)) }
      }
      if let onDetails {
        Button("Show details", systemImage: "info.circle", action: onDetails)
      }
    }
  }

  private var openLabel: LocalizedStringKey {
    switch payload.kind {
    case .email: "Compose"
    case .phone: "Call"
    case .sms: "Message"
    case .geo: "Open Map"
    case .auth: payload.original.lowercased().hasPrefix("fido:") ? "Connect nearby device" : "Open Passwords"
    case .customScheme: "Open app link"
    default: "Open link"
    }
  }

}

struct ResultMenu<Label: View>: View {
  let payload: ScanPayload
  var onDetails: (() -> Void)? = nil
  let onAction: (ActionRoute) -> Void
  var onDismiss: (() -> Void)? = nil
  @ViewBuilder let label: () -> Label
  @State private var openFailed = false
  @State private var confirmPayment = false

  var body: some View {
    Menu {
      ResultActions(payload: payload, onDetails: onDetails, onAction: onAction, onOpen: {
        if payload.kind == .customScheme && payload.original.localizedCaseInsensitiveContains("pay") {
          confirmPayment = true
        } else { open() }
      })
      if let onDismiss {
        Divider()
        Button("Dismiss", systemImage: "xmark", action: onDismiss)
      }
    } label: { label() }
    .alert("This action is unavailable.", isPresented: $openFailed) { Button("OK", role: .cancel) {} }
    .confirmationDialog("Verify this payment in the destination app before paying.", isPresented: $confirmPayment, titleVisibility: .visible) {
      Button("Open app link", action: open)
      Button("Cancel", role: .cancel) {}
    }
  }

  private func open() {
    guard let url = payload.openURL else { return }
    UIApplication.shared.open(url, options: [:]) { succeeded in
      if !succeeded { openFailed = true }
    }
  }
}

struct ResultDetail: View {
  let payload: ScanPayload
  @Environment(\.dismiss) private var dismiss
  @State private var route: ActionRoute?
  var body: some View {
    NavigationStack {
      ScrollView {
        Text(payload.details)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(20)
      }
      .navigationTitle("Scan result")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        ToolbarItem(placement: .topBarTrailing) {
          ResultMenu(payload: payload, onAction: { route = $0 }) { Image(systemName: "ellipsis") }
          .accessibilityLabel("Actions")
        }
      }
    }
    .sheet(item: $route) { NativeActionSheet(route: $0) }
  }
}
