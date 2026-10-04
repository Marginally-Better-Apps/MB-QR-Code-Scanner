import Foundation
@testable import QRScannerCore

/// Manual time. `advance(by:)` wakes sleepers whose deadline passed; `now` can also be set directly.
final class TestClock: ScannerClock, @unchecked Sendable {
  private struct Sleeper {
    let id: UUID
    let deadline: Date
    let continuation: CheckedContinuation<Void, Error>
  }
  private let lock = NSLock()
  private var current: Date
  private var sleepers: [Sleeper] = []

  init(_ start: Date = Date(timeIntervalSince1970: 1_800_000_000)) { current = start }

  var now: Date {
    get { lock.withLock { current } }
    set { lock.withLock { current = newValue } }
  }

  func sleep(for seconds: TimeInterval) async throws {
    let id = UUID()
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        lock.withLock { sleepers.append(Sleeper(id: id, deadline: current.addingTimeInterval(seconds), continuation: continuation)) }
        if Task.isCancelled { cancel(id) }
      }
    } onCancel: {
      cancel(id)
    }
  }

  func advance(by seconds: TimeInterval) {
    let due: [Sleeper] = lock.withLock {
      current = current.addingTimeInterval(seconds)
      let due = sleepers.filter { $0.deadline <= current }
      sleepers.removeAll { $0.deadline <= current }
      return due
    }
    due.forEach { $0.continuation.resume() }
  }

  private func cancel(_ id: UUID) {
    let sleeper: Sleeper? = lock.withLock {
      guard let index = sleepers.firstIndex(where: { $0.id == id }) else { return nil }
      return sleepers.remove(at: index)
    }
    sleeper?.continuation.resume(throwing: CancellationError())
  }
}

@MainActor final class FakeCamera: CameraAuthorizing {
  var authorization: CameraAuthorization
  var answer: CameraAuthorization = .authorized
  var device: CameraCapabilities? = CameraCapabilities(hasTorch: true)
  private(set) var requests = 0

  init(_ authorization: CameraAuthorization) { self.authorization = authorization }

  func requestAccess() async -> CameraAuthorization {
    requests += 1
    authorization = answer
    return authorization
  }

  func capabilities() -> CameraCapabilities? { device }
}

@MainActor final class FakeFeedback: ScanFeedback {
  private(set) var accepted = 0
  private(set) var announcements: [String] = []
  func scanAccepted() { accepted += 1 }
  func announce(_ text: String) { announcements.append(text) }
}

final class InMemoryHistory: HistoryRepository {
  struct Failure: Error {}
  private(set) var events: [HistoryEvent]
  var failWrites = false

  init(_ events: [HistoryEvent] = []) { self.events = HistoryStore.newestFirst(events) }

  @discardableResult
  func record(_ payload: ScanPayload, at date: Date) throws -> HistoryEvent {
    if failWrites { throw Failure() }
    let event = payload.historyEvent(at: date)
    events = HistoryStore.newestFirst([event] + events)
    return event
  }

  func delete(id: String) throws {
    if failWrites { throw Failure() }
    events.removeAll { $0.id == id }
  }

  func restore(_ event: HistoryEvent) throws {
    if failWrites { throw Failure() }
    guard !events.contains(where: { $0.id == event.id }) else { return }
    events = HistoryStore.newestFirst(events + [event])
  }

  func clear() throws {
    if failWrites { throw Failure() }
    events = []
  }
}

func historyEvent(_ id: String, _ acceptedAt: String, kind: String = "url", original: String? = nil) -> HistoryEvent {
  HistoryEvent(id: id, acceptedAt: acceptedAt, kind: kind, summary: original ?? id, original: original ?? "https://example.com/\(id)", parserVersion: 3)
}

/// Lets main-actor tasks woken by the clock run to completion.
@MainActor func settle() async {
  for _ in 0..<20 { await Task.yield() }
}
