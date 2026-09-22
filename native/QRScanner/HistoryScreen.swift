import SwiftUI

struct HistoryScreen: View {
  @Bindable var model: ScannerModel
  @State private var selected: HistoryEvent?
  @State private var confirmClear = false
  @Environment(\.dismiss) private var dismiss

  private var days: [Date] {
    Set(model.events.map { Calendar.current.startOfDay(for: $0.date) }).sorted(by: >)
  }

  var body: some View {
    Group {
      if model.events.isEmpty {
        VStack {
          Button("Scan a QR code", systemImage: "qrcode.viewfinder") { dismiss() }
            .controlSize(.large).modifier(NativeButton())
            .accessibilityIdentifier("history-scan-cta")
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
          .accessibilityIdentifier("history-empty")
      } else {
        List {
          ForEach(days, id: \.self) { day in
            Section(dayLabel(day)) {
              ForEach(model.events.filter { Calendar.current.isDate($0.date, inSameDayAs: day) }) { event in
                Button { selected = event } label: {
                  HStack(spacing: 12) {
                    Image(systemName: symbol(event)).frame(width: 24)
                    Text(title(event)).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    Text(event.date, style: .time).font(.caption).foregroundStyle(.secondary)
                  }.foregroundStyle(.primary).frame(minHeight: 36)
                }
                .accessibilityIdentifier("history-row")
                .accessibilityLabel(title(event))
                .accessibilityValue(event.date.formatted(date: .omitted, time: .shortened))
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                  Button("Delete", systemImage: "trash", role: .destructive) { model.delete(event) }
                    .accessibilityIdentifier("history-row-delete")
                }
              }
            }
          }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("history-list")
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
        Button("Undo", systemImage: "arrow.uturn.backward") { model.undo() }
          .controlSize(.large).modifier(NativeButton())
          .accessibilityIdentifier("history-undo")
          .padding(.bottom, 8)
      }
    }
    .alert("Clear all scans?", isPresented: $confirmClear) {
      Button("Cancel", role: .cancel) {}
      Button("Clear All", role: .destructive) { model.clear() }
    }
    .sheet(item: $selected) { event in
      if let original = event.original {
        ResultDetail(payload: ScanPayload(original))
      } else {
        NavigationStack {
          Text(event.kind == "wifi" ? "The Wi-Fi network was not saved." : "This sensitive code was not saved.")
            .padding(24)
            .navigationTitle(title(event))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { selected = nil } }
        }.presentationDetents([.medium])
      }
    }
    .onAppear { model.showingHistory = true; model.pause() }
  }

  private func title(_ event: HistoryEvent) -> String {
    if event.kind == "redacted" { return NSLocalizedString("Sensitive scan", comment: "") }
    if event.kind == "wifi" { return NSLocalizedString("Wi-Fi network", comment: "") }
    return ScanPayload.visible(event.summary ?? "", limit: 120)
  }
  private func symbol(_ event: HistoryEvent) -> String {
    if event.kind == "redacted" { return "eye.slash" }
    if event.kind == "wifi" { return "wifi" }
    return event.original.map { ScanPayload($0).symbol } ?? "qrcode"
  }
  private func dayLabel(_ day: Date) -> String {
    if Calendar.current.isDateInToday(day) { return NSLocalizedString("Today", comment: "") }
    if Calendar.current.isDateInYesterday(day) { return NSLocalizedString("Yesterday", comment: "") }
    return day.formatted(date: .abbreviated, time: .omitted)
  }
}
