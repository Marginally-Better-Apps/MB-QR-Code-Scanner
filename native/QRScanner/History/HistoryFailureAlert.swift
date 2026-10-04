import SwiftUI

extension HistoryFailure {
  var message: String {
    switch self {
    case .open: String(localized: "History could not be opened. Your saved file has not been changed.")
    case .save: String(localized: "This scan could not be saved.")
    case .delete: String(localized: "The scan could not be deleted.")
    case .restore: String(localized: "The scan could not be restored.")
    case .clear: String(localized: "History could not be cleared.")
    }
  }
}

extension View {
  func historyFailureAlert(_ history: HistoryViewModel) -> some View {
    alert("QR Scanner", isPresented: Binding(get: { history.failure != nil }, set: { if !$0 { history.failure = nil } })) {
      Button("OK", role: .cancel) { history.failure = nil }
    } message: {
      Text(history.failure?.message ?? "")
    }
  }
}
