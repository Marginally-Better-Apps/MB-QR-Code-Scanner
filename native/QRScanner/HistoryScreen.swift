import SwiftUI

struct HistoryScreen: View {
  @Bindable var model: HistoryViewModel
  @State private var selected: HistoryEvent?
  @State private var route: ActionRoute?
  @State private var confirmClear = false
  @Environment(\.dismiss) private var dismiss
  @Environment(\.showToast) private var showToast
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Group {
      if model.events.isEmpty {
        ContentUnavailableView {
          Label("No Scans Yet", systemImage: "qrcode.viewfinder")
        } description: {
          Text("Codes you scan are saved here on this device.")
        } actions: {
          Button("Scan a Code", systemImage: "camera.viewfinder") { dismiss() }
            .controlSize(.large).modifier(ProminentButton())
            .accessibilityIdentifier("history-scan-cta")
        }
        .accessibilityIdentifier("history-empty")
      } else {
        let sections = model.sections
        List {
          ForEach(sections) { section in
            Section(dayTitle(section.label)) {
              ForEach(section.events) { event in
                row(event)
              }
            }
          }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("history-list")
        .searchable(text: $model.query, prompt: "Search History")
        .overlay {
          if sections.isEmpty { ContentUnavailableView.search(text: model.query) }
        }
      }
    }
    .navigationTitle("History")
    .navigationBarTitleDisplayMode(.large)
    .toolbar(.visible, for: .navigationBar)
    .toolbar {
      if !model.events.isEmpty {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Clear History", systemImage: "trash") { confirmClear = true }
            .accessibilityIdentifier("history-clear")
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      if model.pendingUndo != nil {
        Button("Undo Delete", systemImage: "arrow.uturn.backward") { model.undo() }
          .controlSize(.large).modifier(NativeButton())
          .accessibilityIdentifier("history-undo")
          .padding(.bottom, 8)
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(reduceMotion ? .easeInOut(duration: 0.2) : .snappy, value: model.pendingUndo)
    .alert(clearTitle(model.events.count), isPresented: $confirmClear) {
      Button("Cancel", role: .cancel) {}
      Button("Clear All", role: .destructive) { model.clear() }
        .accessibilityIdentifier("history-clear-confirm")
    } message: {
      Text("This removes every saved scan from this device. It can’t be undone.")
    }
    .sheet(item: $selected) { event in
      if let payload = model.payload(for: event) {
        ResultDetail(payload: payload, scannedAt: event.date)
      } else {
        let presentation = HistoryRowPresentation(event)
        NavigationStack {
          ContentUnavailableView {
            Label(presentation.title, systemImage: presentation.symbol(payload: nil))
          } description: {
            Text(presentation.unsavedDetailMessage)
            Text(event.date.formatted(date: .abbreviated, time: .shortened))
          }
          .toolbar { Button("Done") { selected = nil } }
        }.presentationDetents([.medium])
      }
    }
    .sheet(item: $route) { NativeActionSheet(route: $0) }
  }

  private func row(_ event: HistoryEvent) -> some View {
    let presentation = HistoryRowPresentation(event)
    let payload = model.payload(for: event)
    return Button { selected = event } label: {
      HStack(spacing: 12) {
        Image(systemName: presentation.symbol(payload: payload))
          .font(.body.weight(.medium))
          .frame(width: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(presentation.title).lineLimit(1)
          Text(presentation.subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Text(event.date, style: .time).font(.caption).foregroundStyle(.secondary)
      }
      .frame(minHeight: 44)
    }
    .tint(.primary)
    .accessibilityIdentifier("history-row")
    .accessibilityLabel(presentation.title)
    .accessibilityValue("\(presentation.subtitle), \(event.date.formatted(date: .omitted, time: .shortened))")
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button("Delete", systemImage: "trash", role: .destructive) { model.delete(event) }
        .accessibilityIdentifier("history-row-delete")
    }
    .contextMenu {
      if let payload {
        Button("Copy", systemImage: "doc.on.doc") {
          ScanPayload.copy(payload.original)
          showToast(String(localized: "Copied"))
        }
        Button("Share", systemImage: "square.and.arrow.up") {
          route = ActionRoute(kind: .share, payload: payload)
        }
        Divider()
      }
      Button("Delete", systemImage: "trash", role: .destructive) { model.delete(event) }
    }
  }

  private func dayTitle(_ label: HistoryDayLabel) -> String {
    switch label {
    case .today: String(localized: "Today")
    case .yesterday: String(localized: "Yesterday")
    case .weekday(let text), .date(let text): text
    }
  }

  /// "Clear 1 scan?" / "Clear 3 scans?" via automatic grammar agreement.
  private func clearTitle(_ count: Int) -> String {
    String(AttributedString(localized: "Clear ^[\(count) scan](inflect: true)?").characters)
  }
}
