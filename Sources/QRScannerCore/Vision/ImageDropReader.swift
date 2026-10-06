import Foundation
import UniformTypeIdentifiers

/// Loads the image representation supplied by Photos, Files, or another drag source.
@MainActor enum ImageDropReader {
  static func read(_ providers: [NSItemProvider]) async throws -> Data? {
    guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }),
      let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) else { return nil }
    return try await withCheckedThrowingContinuation { continuation in
      provider.loadDataRepresentation(forTypeIdentifier: type) { data, error in
        if let data { continuation.resume(returning: data) }
        else { continuation.resume(throwing: error ?? ImportedImageDecoder.Failure.unreadable) }
      }
    }
  }
}
