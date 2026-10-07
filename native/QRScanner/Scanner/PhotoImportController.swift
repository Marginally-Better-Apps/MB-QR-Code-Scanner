import Foundation
import SwiftUI
import Observation
import PhotosUI
import UniformTypeIdentifiers

@MainActor @Observable
final class PhotoImportController {
  enum Failure { case unreadable, noCodes }
  private(set) var isLoading = false
  var failure: Failure?
  @ObservationIgnored private var task: Task<Void, Never>?

  func load(_ photo: PhotosPickerItem, into model: ScannerViewModel) {
    start(into: model) {
      guard let data = try await photo.loadTransferable(type: Data.self) else { throw ImportedImageDecoder.Failure.unreadable }
      return data
    }
  }

  func drop(_ providers: [NSItemProvider], into model: ScannerViewModel) -> Bool {
    guard !isLoading, providers.contains(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) else { return false }
    start(into: model) {
      guard let data = try await ImageDropReader.read(providers) else { throw ImportedImageDecoder.Failure.unreadable }
      return data
    }
    return true
  }

  func cancel(_ model: ScannerViewModel) {
    task?.cancel()
    task = nil
    isLoading = false
    model.cancelPhotoImport()
  }

  private func start(into model: ScannerViewModel, load: @escaping @MainActor () async throws -> Data) {
    guard !isLoading else { return }
    failure = nil
    isLoading = true
    model.beginPhotoImport()
    task = Task {
      do {
        let data = try await load()
        try Task.checkCancellation()
        let decoded = try await Task.detached(priority: .userInitiated) { try ImportedImageDecoder.decode(data) }.value
        try Task.checkCancellation()
        guard model.phase != .background else { return cancel(model) }
        if decoded.detections.isEmpty {
          failure = .noCodes
          model.cancelPhotoImport()
        } else { model.acceptPhoto(decoded) }
      } catch {
        guard !Task.isCancelled else { return }
        failure = .unreadable
        model.cancelPhotoImport()
      }
      isLoading = false
      task = nil
    }
  }
}
