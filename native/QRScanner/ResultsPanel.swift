import SwiftUI

struct ResultsPanel: View {
  let results: [ScanPayload]
  let maxHeight: CGFloat
  let onDetails: (ScanPayload) -> Void
  let onAction: (ActionRoute) -> Void
  let onDismiss: (ScanPayload) -> Void
  @ScaledMetric(relativeTo: .body) private var rowHeight = 64.0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var measuredHeight: CGFloat?

  /// Rows are a fixed height at standard sizes. Accessibility sizes wrap titles, so the panel follows the measured content.
  private var height: CGFloat {
    let estimate = CGFloat(results.count) * rowHeight + 12
    let content = typeSize.isAccessibilitySize ? (measuredHeight ?? estimate) : estimate
    return min(content, maxHeight)
  }

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        ForEach(Array(results.enumerated()), id: \.element.id) { index, payload in
          if index > 0 { Divider().padding(.leading, 40) }
          ResultMenu(payload: payload, showsQuickAction: true, onDetails: { onDetails(payload) }, onDismiss: { onDismiss(payload) }) {
            ResultLabel(payload: payload)
              .frame(minHeight: rowHeight)
              .contentShape(Rectangle())
              .accessibilityIdentifier("scan-result-row")
          }
          .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .bottom)))
        }
      }
      .padding(.leading, 18).padding(.trailing, 10).padding(.vertical, 6)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measuredHeight = $0 }
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: height)
    .clipShape(.rect(cornerRadius: 28))
    .modifier(NativeGlass())
    .overlay {
      if contrast == .increased {
        RoundedRectangle(cornerRadius: 28).strokeBorder(Color.primary.opacity(0.5), lineWidth: 1).allowsHitTesting(false)
      }
    }
    // Presentations live here, not in each row, so they survive a row leaving when the camera sees new codes.
    .payloadActionHost(onAction: onAction)
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
      ResultTitle(payload: payload)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityElement(children: .combine)
  }
}

/// Menu items for a result's actions. The rules come from `PayloadActionRules`; this only renders them.
struct ResultActions: View {
  let payload: ScanPayload
  let actions: PayloadActionSet
  var onDetails: (() -> Void)?
  let perform: (PayloadAction, ScanPayload) -> Void

  var body: some View {
    Group {
      if let reason = actions.openUnavailableReason { Text(reason.explanation) }
      ForEach(actions.actions, id: \.self) { action in
        Button(payload.title(for: action), systemImage: payload.symbol(for: action)) { perform(action, payload) }
      }
      if let onDetails {
        Button("Show Details", systemImage: "info.circle", action: onDetails)
      }
    }
  }
}

struct ResultMenu<Label: View>: View {
  let payload: ScanPayload
  var showsQuickAction = false
  var onDetails: (() -> Void)? = nil
  var onDismiss: (() -> Void)? = nil
  @ViewBuilder let label: () -> Label
  @Environment(\.payloadActions) private var context
  @ScaledMetric(relativeTo: .body) private var quickActionSide = 30.0

  var body: some View {
    let actions = context.actions(for: payload)
    HStack(spacing: 8) {
      Menu {
        ResultActions(payload: payload, actions: actions, onDetails: onDetails, perform: context.perform)
        if let onDismiss {
          Divider()
          Button("Dismiss", systemImage: "xmark", action: onDismiss)
        }
      } label: { label() }
      .menuActionDismissBehavior(.enabled)
      .tint(.primary)
      if showsQuickAction, let action = actions.primary {
        Button { context.perform(action, payload) } label: {
          Image(systemName: payload.symbol(for: action))
            .font(.body.weight(.semibold))
            .frame(width: quickActionSide, height: quickActionSide)
            // Image-only labels hit-test only their own bounds, so extend the tappable circle to at least 44 points.
            .contentShape(Circle().inset(by: -max(0, (44 - quickActionSide) / 2)))
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.circle)
        .accessibilityLabel(Text(payload.title(for: action)) + Text(verbatim: ", \(payload.title)"))
        .accessibilityIdentifier("scan-result-quick-action")
      }
    }
  }
}

struct ResultDetail: View {
  let payload: ScanPayload
  var scannedAt: Date? = nil
  @State private var route: ActionRoute?

  var body: some View {
    ResultDetailContent(payload: payload, scannedAt: scannedAt)
      .payloadActionHost(onAction: { route = $0 })
      .toastHost()
      .presentationDetents([.medium, .large])
      .sheet(item: $route) { NativeActionSheet(route: $0) }
  }
}

private struct ResultDetailContent: View {
  let payload: ScanPayload
  let scannedAt: Date?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.payloadActions) private var context
  @Environment(\.colorSchemeContrast) private var contrast

  var body: some View {
    let actions = context.actions(for: payload)
    NavigationStack {
      List {
        Section {
          HStack(spacing: 14) {
            Image(systemName: payload.symbol)
              .font(.title2)
              .foregroundStyle(.tint)
              .frame(width: 48, height: 48)
              .background(.tint.opacity(contrast == .increased ? 0.28 : 0.14), in: .rect(cornerRadius: 12))
            ResultTitle(payload: payload, titleFont: .headline, subtitleFont: .subheadline, lineLimit: 3)
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
        if let reason = actions.openUnavailableReason {
          Section {
            Label(reason.explanation, systemImage: "info.circle").foregroundStyle(.secondary)
          }
        }
        if let scannedAt {
          Section {
            LabeledContent("Scanned") {
              VStack(alignment: .trailing, spacing: 2) {
                Text(scannedAt.formatted(date: .abbreviated, time: .shortened))
                Text(scannedAt.formatted(.relative(presentation: .named))).font(.footnote)
              }
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .safeAreaInset(edge: .bottom) {
        if let action = actions.primary {
          Button { context.perform(action, payload) } label: {
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
            ResultActions(payload: payload, actions: actions, perform: context.perform)
          } label: { Image(systemName: "ellipsis") }
          .accessibilityLabel("Actions")
        }
      }
    }
  }
}
