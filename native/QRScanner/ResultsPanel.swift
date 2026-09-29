import SwiftUI

struct ResultsPanel: View {
  let results: [ScanPayload]
  let maxHeight: CGFloat
  let onDetails: (ScanPayload) -> Void
  let onAction: (ActionRoute) -> Void
  let onDismiss: (ScanPayload) -> Void
  @ScaledMetric(relativeTo: .body) private var rowHeight = 64.0

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        ForEach(Array(results.enumerated()), id: \.element.id) { index, payload in
          if index > 0 { Divider().padding(.leading, 40) }
          ResultMenu(payload: payload, showsQuickAction: true, onDetails: { onDetails(payload) }, onAction: onAction, onDismiss: { onDismiss(payload) }) {
            ResultLabel(payload: payload)
              .frame(minHeight: rowHeight)
              .contentShape(Rectangle())
              .accessibilityIdentifier("scan-result-row")
          }
          .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
      }.padding(.leading, 18).padding(.trailing, 10).padding(.vertical, 6)
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: min(CGFloat(results.count) * rowHeight + 12, maxHeight))
    .clipShape(.rect(cornerRadius: 28))
    .modifier(NativeGlass())
    .accessibilityIdentifier("scan-results-panel")
  }
}

struct ResultLabel: View {
  let payload: ScanPayload

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: payload.symbol)
        .font(.body.weight(.medium))
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 2) {
        Text(payload.title).font(.body).lineLimit(1)
        Text(payload.subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityElement(children: .combine)
  }
}

struct ResultActions: View {
  let payload: ScanPayload
  var onDetails: (() -> Void)?
  let perform: (PayloadAction) -> Void

  var body: some View {
    Group {
      if payload.openURL != nil { button(.open) }
      if payload.productCode != nil { button(.lookup) }
      if payload.kind == .contact { button(.addContact) }
      if payload.kind == .calendar { button(.addEvent) }
      if let wifi = payload.wifi, !wifi.password.isEmpty { button(.copyPassword) }
      if !payload.isSensitive {
        button(.copy)
        button(.share)
      }
      if let onDetails {
        Button("Show Details", systemImage: "info.circle", action: onDetails)
      }
    }
  }

  private func button(_ action: PayloadAction) -> some View {
    Button(payload.title(for: action), systemImage: payload.symbol(for: action)) { perform(action) }
  }
}

struct ResultMenu<Label: View>: View {
  let payload: ScanPayload
  var showsQuickAction = false
  var onDetails: (() -> Void)? = nil
  let onAction: (ActionRoute) -> Void
  var onDismiss: (() -> Void)? = nil
  @ViewBuilder let label: () -> Label

  var body: some View {
    PayloadActionHost(payload: payload, onAction: onAction) { perform in
      HStack(spacing: 8) {
        Menu {
          ResultActions(payload: payload, onDetails: onDetails, perform: perform)
          if let onDismiss {
            Divider()
            Button("Dismiss", systemImage: "xmark", action: onDismiss)
          }
        } label: { label() }
        .menuActionDismissBehavior(.enabled)
        .tint(.primary)
        if showsQuickAction, let action = payload.primaryAction {
          Button { perform(action) } label: {
            Image(systemName: payload.symbol(for: action))
              .font(.body.weight(.semibold))
              .frame(width: 22, height: 22)
          }
          .buttonStyle(.bordered)
          .buttonBorderShape(.circle)
          .accessibilityLabel(Text(payload.title(for: action)) + Text(verbatim: ", \(payload.title)"))
          .accessibilityIdentifier("scan-result-quick-action")
        }
      }
    }
  }
}

struct ResultDetail: View {
  let payload: ScanPayload
  var scannedAt: Date? = nil
  @Environment(\.dismiss) private var dismiss
  @State private var route: ActionRoute?

  var body: some View {
    PayloadActionHost(payload: payload, onAction: { route = $0 }) { perform in
      NavigationStack {
        List {
          Section {
            HStack(spacing: 14) {
              Image(systemName: payload.symbol)
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 48, height: 48)
                .background(.tint.opacity(0.14), in: .rect(cornerRadius: 12))
              VStack(alignment: .leading, spacing: 3) {
                Text(payload.title).font(.headline).lineLimit(3)
                Text(payload.subtitle).font(.subheadline).foregroundStyle(.secondary)
              }
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
          }
          if payload.details != payload.title {
            Section("Contents") {
              Text(payload.details)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
          if let scannedAt {
            Section {
              LabeledContent("Scanned", value: scannedAt.formatted(date: .abbreviated, time: .shortened))
            }
          }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .bottom) {
          if let action = payload.primaryAction {
            Button { perform(action) } label: {
              Label(payload.title(for: action), systemImage: payload.symbol(for: action))
                .font(.headline)
                .frame(maxWidth: .infinity)
            }
            .controlSize(.large)
            .modifier(ProminentButton())
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
          }
        }
        .navigationTitle("Scan Result")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
          ToolbarItem(placement: .topBarLeading) {
            Menu {
              ResultActions(payload: payload, perform: perform)
            } label: { Image(systemName: "ellipsis") }
            .accessibilityLabel("Actions")
          }
        }
      }
    }
    .toastHost()
    .presentationDetents([.medium, .large])
    .sheet(item: $route) { NativeActionSheet(route: $0) }
  }
}
