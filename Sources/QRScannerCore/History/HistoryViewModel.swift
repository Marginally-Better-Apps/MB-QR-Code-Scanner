import Foundation
import Observation

enum HistoryFailure: Equatable {
  /// The saved file could not be read. It is left unchanged.
  case open
  case save, delete, restore, clear
}

/// History state shared by the scanner (recording) and the History screen (browse, delete, undo, clear).
@MainActor @Observable
final class HistoryViewModel {
  static let undoTimeout: TimeInterval = 5

  private(set) var events: [HistoryEvent] = []
  private(set) var pendingUndo: HistoryEvent?
  var failure: HistoryFailure?
  var isAvailable: Bool { repositoryOpened }

  /// Search text; sections are filtered by it.
  var query: String {
    get { storedQuery }
    set { if storedQuery != newValue { storedQuery = newValue } }
  }

  /// Day sections for the current events and query. Rebuilt only when an input changes.
  var sections: [HistorySection] {
    let key = SectionKey(events: eventsRevision, query: storedQuery.trimmingCharacters(in: .whitespaces), day: dayRevision)
    if let memo = sectionMemo, memo.key == key { return memo.sections }
    let matching = key.query.isEmpty ? events : events.filter { searchableText(for: $0).localizedStandardContains(key.query) }
    let built = HistorySections.make(matching, now: clock.now, calendar: calendar, locale: locale)
    sectionMemo = (key, built)
    return built
  }

  private var storedQuery = ""
  private var eventsRevision = 0
  private var dayRevision = 0
  private var repositoryOpened = false
  @ObservationIgnored private var repository: HistoryRepository?
  @ObservationIgnored private let open: () throws -> HistoryRepository
  @ObservationIgnored private let clock: ScannerClock
  @ObservationIgnored private let searchText: (HistoryEvent) -> String
  @ObservationIgnored private var searchIndex: [String: String] = [:]
  @ObservationIgnored private var sectionMemo: (key: SectionKey, sections: [HistorySection])?
  @ObservationIgnored private var undoTask: Task<Void, Never>?
  @ObservationIgnored private var reportedOpenFailure = false
  @ObservationIgnored private var reportedDroppedScan = false
  @ObservationIgnored var calendar: Calendar
  @ObservationIgnored var locale: Locale
  /// Parsed payloads for rows, so symbols and details are not re-parsed on every render.
  @ObservationIgnored let payloads = ScanPayloadCache()

  private struct SectionKey: Equatable {
    let events: Int
    let query: String
    let day: Int
  }

  /// - Parameters:
  ///   - searchText: Localized text a search matches against, for example the row title and subtitle.
  ///   - open: Opens the backing store. Retried later if it throws.
  init(clock: ScannerClock = SystemClock(), calendar: Calendar = .autoupdatingCurrent, locale: Locale = .autoupdatingCurrent,
       searchText: @escaping (HistoryEvent) -> String = { [$0.summary, $0.original].compactMap { $0 }.joined(separator: "\n") },
       open: @escaping () throws -> HistoryRepository) {
    self.clock = clock
    self.calendar = calendar
    self.locale = locale
    self.searchText = searchText
    self.open = open
    // A launch while the device is locked can fail; activation retries before reporting.
    openIfNeeded()
  }

  /// Opens the store if it is not open yet. Returns whether History is usable.
  @discardableResult
  func openIfNeeded() -> Bool {
    if repository != nil { return true }
    do {
      let opened = try open()
      repository = opened
      repositoryOpened = true
      update(opened.events)
      if failure == .open { failure = nil }
      return true
    } catch {
      return false
    }
  }

  /// Called when the app becomes active. Reports an unreadable file once instead of on every scan.
  func activate() {
    refreshDays()
    if !openIfNeeded() && !reportedOpenFailure {
      reportedOpenFailure = true
      failure = .open
    }
  }

  /// Rebuilds day labels and grouping after midnight or a time-zone change.
  func refreshDays() {
    dayRevision &+= 1
  }

  func record(_ payload: ScanPayload, at date: Date) {
    guard openIfNeeded(), let repository else {
      // The first scan that can't be saved is reported; later ones don't alert on every frame.
      if !reportedDroppedScan {
        reportedDroppedScan = true
        failure = .open
      }
      return
    }
    do {
      try repository.record(payload, at: date)
      update(repository.events)
    } catch {
      failure = .save
    }
  }

  func delete(_ event: HistoryEvent) {
    guard let repository else {
      failure = .open
      return
    }
    do {
      try repository.delete(id: event.id)
      update(repository.events)
      pendingUndo = event
      scheduleUndoExpiry(for: event)
    } catch {
      failure = .delete
    }
  }

  func undo() {
    guard let event = pendingUndo else { return }
    guard let repository else {
      failure = .open
      return
    }
    do {
      try repository.restore(event)
      update(repository.events)
      cancelUndo()
    } catch {
      failure = .restore
    }
  }

  func clear() {
    guard let repository else {
      failure = .open
      return
    }
    do {
      try repository.clear()
      update(repository.events)
      cancelUndo()
    } catch {
      failure = .clear
    }
  }

  /// The parsed payload for a row, or `nil` when the raw payload was never saved.
  func payload(for event: HistoryEvent) -> ScanPayload? {
    event.original.map { payloads.payload($0, format: event.format ?? .qr) }
  }

  private func update(_ next: [HistoryEvent]) {
    events = next
    eventsRevision &+= 1
    if searchIndex.count > next.count + 256 { searchIndex.removeAll() }
  }

  private func searchableText(for event: HistoryEvent) -> String {
    if let cached = searchIndex[event.id] { return cached }
    let text = searchText(event)
    searchIndex[event.id] = text
    return text
  }

  private func scheduleUndoExpiry(for event: HistoryEvent) {
    undoTask?.cancel()
    undoTask = Task { [weak self, clock] in
      do { try await clock.sleep(for: Self.undoTimeout) } catch { return }
      guard !Task.isCancelled, let self, self.pendingUndo?.id == event.id else { return }
      self.pendingUndo = nil
    }
  }

  private func cancelUndo() {
    undoTask?.cancel()
    undoTask = nil
    pendingUndo = nil
  }
}
