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

/// A decoded photo for view model tests, which never look at its pixels.
func importedPhoto(_ detections: [Detection]) -> ImportedPhoto {
  let context = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  return ImportedPhoto(image: context.makeImage()!, detections: detections)
}

@Test(arguments: [UInt32(1), 2, 3, 4, 5, 6, 7, 8]) func importedPhotosDecodeRealPixelsInEveryOrientation(_ orientation: UInt32) throws {
  let data = try encodedPhoto(CodeImages.qr("https://example.com/photo"), orientation: orientation)
  let detections = try ImportedImageDecoder.decode(data).detections
  #expect(detections.map(\.payload) == ["https://example.com/photo"])
  #expect(detections.first?.format == .qr)
  // Outlines are drawn on the photo, so bounds must land inside it whatever the orientation.
  let bounds = try #require(detections.first?.bounds)
  #expect(bounds.width > 0.5 && bounds.height > 0.5)
  #expect(CGRect(x: 0, y: 0, width: 1, height: 1).insetBy(dx: -0.01, dy: -0.01).contains(bounds))
}

@Test func importedPhotoOutlinesFollowEachCode() throws {
  let photo = try ImportedImageDecoder.decode(encodedPhoto(CodeImages.sideBySide(CodeImages.qr("left"), CodeImages.qr("right"))))
  let left = try #require(photo.detections.first { $0.payload == "left" })
  let right = try #require(photo.detections.first { $0.payload == "right" })
  #expect(left.bounds.midX < 0.5 && right.bounds.midX > 0.5)
}

@Test(arguments: ["public.png", "public.jpeg", "public.heic"])
func importedScreenshotsAndCameraPhotoFormatsDecode(_ type: String) throws {
  let data = try encodedPhoto(CodeImages.qr("camera photo"), type: type)
  #expect(try ImportedImageDecoder.decode(data).detections.map(\.payload) == ["camera photo"])
}

@Test func importedPhotoFindsAllCodesAndHandlesBlankAndInvalidImages() throws {
  let image = CodeImages.sideBySide(CodeImages.qr("first photo code"), CodeImages.qr("second photo code"))
  #expect(Set(try ImportedImageDecoder.decode(encodedPhoto(image)).detections.map(\.payload)) == ["first photo code", "second photo code"])
  #expect(try ImportedImageDecoder.decode(encodedPhoto(CodeImages.blank())).detections.isEmpty)
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
  scanner.acceptPhoto(importedPhoto(detections))
  #expect(scanner.results.count == 2)
  #expect(scanner.photoHighlights.count == 2)
  #expect(scanner.highlights.isEmpty)
  #expect(!scanner.isCapturing)
  #expect(scanner.showingPhotoResults)
  #expect(feedback.accepted == 1)
  #expect(history.events.count == 2)
  #expect(history.events.first(where: { $0.category == .payload(.auth) })?.original == detections[1].payload)
  #expect(try HistoryStore(directory: directory).events.count == 2)
  scanner.setPhase(.background)
  #expect(scanner.results.map(\.original) == ["https://example.com/photo"])
  // The photo stays, but the sensitive code loses its outline with its result.
  #expect(scanner.showingPhotoResults)
  #expect(scanner.photoHighlights.map(\.payload) == ["https://example.com/photo"])
}

@MainActor @Test func backgroundClosesAPhotoWithOnlySensitiveCodes() {
  let scanner = ScannerViewModel(camera: FakeCamera(.authorized), history: HistoryViewModel(open: { InMemoryHistory() }), feedback: FakeFeedback())
  scanner.setPhase(.active)
  scanner.beginPhotoImport()
  scanner.acceptPhoto(importedPhoto([Detection("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP")]))
  #expect(scanner.showingPhotoResults)
  scanner.setPhase(.background)
  #expect(!scanner.showingPhotoResults)
  scanner.setPhase(.active)
  #expect(scanner.isCapturing)
}

@MainActor @Test func cancelAndEmptyPhotoImportPreserveExistingResults() {
  let repository = InMemoryHistory()
  let history = HistoryViewModel(open: { repository })
  let scanner = ScannerViewModel(camera: FakeCamera(.authorized), history: history, feedback: FakeFeedback())
  scanner.setPhase(.active)
  scanner.beginPhotoImport()
  scanner.acceptPhoto(importedPhoto([Detection("photo code"), Detection("photo code")]))
  #expect(scanner.results.count == 1)
  #expect(history.events.count == 1)
  scanner.beginPhotoImport()
  scanner.cancelPhotoImport()
  #expect(scanner.results.first?.original == "photo code")
  #expect(scanner.showingPhotoResults)
  scanner.beginPhotoImport()
  scanner.acceptPhoto(importedPhoto([]))
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
  #expect(try ImportedImageDecoder.decode(received).detections.map(\.payload) == ["https://example.com/dropped-photo"])
  let text = NSItemProvider()
  text.registerDataRepresentation(forTypeIdentifier: "public.utf8-plain-text", visibility: .all) { completion in
    completion(Data("not a photo".utf8), nil)
    return nil
  }
  #expect(try await ImageDropReader.read([text]) == nil)
}
