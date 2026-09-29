import SwiftUI

struct HistoryScreen: View {
  @Bindable var model: ScannerModel
  @State private var selected: HistoryEvent?
  @State private var route: ActionRoute?
  @State private var confirmClear = false
  @State private var query = ""
  @Environment(\.dismiss) private var dismiss
  @Environment(\.showToast) private var showToast

  private var visibleEvents: [HistoryEvent] {
    let trimmed = query.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return model.events }
    return model.events.filter { event in
      title(event).localizedStandardContains(trimmed) || subtitle(event).localizedStandardContains(trimmed)
        || (event.original?.localizedStandardContains(trimmed) ?? false)
    }
  }

  private var days: [Date] {
    Set(visibleEvents.map { Calendar.current.startOfDay(for: $0.date) }).sorted(by: >)
  }

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
        List {
          ForEach(days, id: \.self) { day in
            Section(dayLabel(day)) {
              ForEach(visibleEvents.filter { Calendar.current.isDate($0.date, inSameDayAs: day) }) { event in
                row(event)
              }
            }
          }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("history-list")
        .searchable(text: $query, prompt: "Search History")
        .overlay {
          if visibleEvents.isEmpty { ContentUnavailableView.search(text: query) }
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
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.snappy, value: model.pendingUndo)
    .alert("Clear all scans?", isPresented: $confirmClear) {
      Button("Cancel", role: .cancel) {}
      Button("Clear All", role: .destructive) { model.clear() }
    } message: {
      Text("This removes every saved scan from this device. It can’t be undone.")
    }
    .sheet(item: $selected) { event in
      if let original = event.original {
        ResultDetail(payload: ScanPayload(original, format: event.format ?? .qr), scannedAt: event.date)
      } else {
        NavigationStack {
          ContentUnavailableView {
            Label(title(event), systemImage: symbol(event))
          } description: {
            Text(event.kind == "wifi" ? "The Wi-Fi network was not saved." : event.kind == "boardingPass" ? "The boarding pass details were not saved." : "This sensitive code was not saved.")
            Text(event.date.formatted(date: .abbreviated, time: .shortened))
          }
          .toolbar { Button("Done") { selected = nil } }
        }.presentationDetents([.medium])
      }
    }
    .sheet(item: $route) { NativeActionSheet(route: $0) }
    .onAppear { model.showingHistory = true; model.pause() }
  }

  private func row(_ event: HistoryEvent) -> some View {
    Button { selected = event } label: {
      HStack(spacing: 12) {
        Image(systemName: symbol(event))
          .font(.body.weight(.medium))
          .frame(width: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(title(event)).lineLimit(1)
          Text(subtitle(event)).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Text(event.date, style: .time).font(.caption).foregroundStyle(.secondary)
      }
      .frame(minHeight: 44)
    }
    .tint(.primary)
    .accessibilityIdentifier("history-row")
    .accessibilityLabel(title(event))
    .accessibilityValue("\(subtitle(event)), \(event.date.formatted(date: .omitted, time: .shortened))")
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button("Delete", systemImage: "trash", role: .destructive) { model.delete(event) }
        .accessibilityIdentifier("history-row-delete")
    }
    .contextMenu {
      if let original = event.original {
        Button("Copy", systemImage: "doc.on.doc") {
          ScanPayload.copy(original)
          showToast(String(localized: "Copied"))
        }
        Button("Share", systemImage: "square.and.arrow.up") {
          route = ActionRoute(kind: .share, payload: ScanPayload(original, format: event.format ?? .qr))
        }
        Divider()
      }
      Button("Delete", systemImage: "trash", role: .destructive) { model.delete(event) }
    }
  }

  private func title(_ event: HistoryEvent) -> String {
    if event.kind == "redacted" { return NSLocalizedString("Sensitive scan", comment: "") }
    if event.kind == "wifi" { return NSLocalizedString("Wi-Fi network", comment: "") }
    if event.kind == "boardingPass" { return NSLocalizedString("Boarding pass", comment: "") }
    return ScanPayload.visible(event.summary ?? "", limit: 120)
  }
  private func subtitle(_ event: HistoryEvent) -> String {
    guard event.original != nil else { return String(localized: "Details not saved") }
    let kind = ScanPayload.Kind(rawValue: event.kind).map(ScanPayload.kindName) ?? String(localized: "Text")
    return "\(kind) · \((event.format ?? .qr).name)"
  }
  private func symbol(_ event: HistoryEvent) -> String {
    if event.kind == "redacted" { return "eye.slash" }
    if event.kind == "wifi" { return "wifi" }
    if event.kind == "boardingPass" { return "airplane" }
    return event.original.map { ScanPayload($0, format: event.format ?? .qr).symbol } ?? "qrcode"
  }
  private func dayLabel(_ day: Date) -> String {
    if Calendar.current.isDateInToday(day) { return NSLocalizedString("Today", comment: "") }
    if Calendar.current.isDateInYesterday(day) { return NSLocalizedString("Yesterday", comment: "") }
    return day.formatted(date: .abbreviated, time: .omitted)
  }
}
