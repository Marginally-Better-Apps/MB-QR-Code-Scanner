import CoreImage
import Foundation
import ImageIO
import Testing
@testable import QRScannerCore

private func encodedPhoto(_ image: CIImage, orientation: UInt32 = 1, type: String = "public.tiff") throws -> Data {
  let pixels = try #require(CIContext().createCGImage(image, from: image.extent))
  let data = NSMutableData()
  let destination = try #require(CGImageDestinationCreateWithData(data, type as CFString, 1, nil))
  CGImageDestinationAddImage(destination, pixels, [kCGImagePropertyOrientation: orientation] as CFDictionary)
  #expect(CGImageDestinationFinalize(destination))
  return data as Data
}

@Test(arguments: [UInt32(1), 2, 3, 4, 5, 6, 7, 8]) func importedPhotosDecodeRealPixelsInEveryOrientation(_ orientation: UInt32) throws {
  let data = try encodedPhoto(CodeImages.qr("https://example.com/photo"), orientation: orientation)
  let detections = try ImportedImageDecoder.decode(data)
  #expect(detections.map(\.payload) == ["https://example.com/photo"])
  #expect(detections.first?.format == .qr)
}

@Test(arguments: ["public.png", "public.jpeg", "public.heic"])
func importedScreenshotsAndCameraPhotoFormatsDecode(_ type: String) throws {
  let data = try encodedPhoto(CodeImages.qr("camera photo"), type: type)
  #expect(try ImportedImageDecoder.decode(data).map(\.payload) == ["camera photo"])
}

@Test func importedPhotoFindsAllCodesAndHandlesBlankAndInvalidImages() throws {
  let image = CodeImages.sideBySide(CodeImages.qr("first photo code"), CodeImages.qr("second photo code"))
  #expect(Set(try ImportedImageDecoder.decode(encodedPhoto(image)).map(\.payload)) == ["first photo code", "second photo code"])
  #expect(try ImportedImageDecoder.decode(encodedPhoto(CodeImages.blank())).isEmpty)
  #expect(throws: ImportedImageDecoder.Failure.unreadable) { try ImportedImageDecoder.decode(Data("not an image".utf8)) }
}

@MainActor @Test func photoImportWorksWithoutCameraAndKeepsSafeHistoryAndBackgroundRules() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  let store = try HistoryStore(directory: directory)
  let history = HistoryViewModel(open: { store })
  let feedback = FakeFeedback()
  let scanner = ScannerViewModel(camera: FakeCamera(.denied), history: history, feedback: feedback)
  scanner.setPhase(.active)
  let detections = [Detection("https://example.com/photo"), Detection("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP")]
  scanner.beginPhotoImport()
  scanner.acceptPhoto(detections)
  #expect(scanner.results.count == 2)
  #expect(scanner.highlights.isEmpty)
  #expect(!scanner.isCapturing)
  #expect(scanner.showingPhotoResults)
  #expect(feedback.accepted == 1)
  #expect(history.events.count == 2)
  #expect(history.events.first(where: { $0.category == .redacted })?.original == nil)
  #expect(try HistoryStore(directory: directory).events.count == 2)
  scanner.setPhase(.background)
  #expect(scanner.results.map(\.original) == ["https://example.com/photo"])
}

@MainActor @Test func cancelAndEmptyPhotoImportPreserveExistingResults() {
  let repository = InMemoryHistory()
  let history = HistoryViewModel(open: { repository })
  let scanner = ScannerViewModel(camera: FakeCamera(.authorized), history: history, feedback: FakeFeedback())
  scanner.setPhase(.active)
  scanner.beginPhotoImport()
  scanner.acceptPhoto([Detection("photo code"), Detection("photo code")])
  #expect(scanner.results.count == 1)
  #expect(history.events.count == 1)
  scanner.beginPhotoImport()
  scanner.cancelPhotoImport()
  #expect(scanner.results.first?.original == "photo code")
  #expect(scanner.showingPhotoResults)
  scanner.beginPhotoImport()
  scanner.acceptPhoto([])
  #expect(history.events.count == 1)
  #expect(scanner.results.first?.original == "photo code")
  scanner.resumeCamera()
  #expect(scanner.isCapturing)
  #expect(!scanner.showingPhotoResults)
}

@MainActor @Test func droppedImageProviderDecodesRealBytesAndRejectsNonImages() async throws {
  let data = try encodedPhoto(CodeImages.qr("https://example.com/dropped-photo"))
  let provider = NSItemProvider()
  provider.registerDataRepresentation(forTypeIdentifier: "public.tiff", visibility: .all) { completion in
    completion(data, nil)
    return nil
  }
  let received = try #require(try await ImageDropReader.read([provider]))
  #expect(try ImportedImageDecoder.decode(received).map(\.payload) == ["https://example.com/dropped-photo"])
  let text = NSItemProvider()
  text.registerDataRepresentation(forTypeIdentifier: "public.utf8-plain-text", visibility: .all) { completion in
    completion(Data("not a photo".utf8), nil)
    return nil
  }
  #expect(try await ImageDropReader.read([text]) == nil)
}
