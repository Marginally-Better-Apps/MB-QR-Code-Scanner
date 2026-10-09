import Foundation
import Testing
@testable import QRScannerCore

private let sample = "M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100"

@Test func iataBoardingPassUsesThePNRFieldOffsets() throws {
  #expect(sample.count == BoardingPassParser.minimumLength)
  let summary = try #require(BoardingPassParser.summary(sample, format: .qr))
  #expect(summary == .init(origin: "YUL", destination: "FRA", carrier: "AC", flight: "834", julianDay: 326))
}

@Test func boardingPassesKeepPassengerAndTicketDataInEveryTwoDimensionalFormat() {
  for format in [CodeFormat.qr, .aztec, .dataMatrix, .pdf417] {
    let pass = ScanPayload(sample, format: format)
    #expect(pass.kind == .boardingPass, "\(format.name)")
    #expect(pass.isSensitive, "\(format.name)")
    #expect(pass.details.contains("YUL"))
    #expect(pass.details.contains("AC 834"))
    #expect(pass.details.contains("Passenger: DESMARAIS/LUC"))
    #expect(pass.details.contains("Booking reference: ABC123"))
    #expect(pass.details.contains("Seat: 001A"))
    #expect(pass.details.contains("Cabin: J"))
    #expect(pass.details.contains("Check-in sequence: 0025"))
    #expect(!pass.title.contains("DESMARAIS"))
    let event = pass.historyEvent(at: Date())
    #expect(event.original == sample)
    #expect(pass.rawData == sample)
    #expect(PayloadActionRules.actions(for: pass).actions == [.copy, .share])
    #expect(event.kind == "boardingPass")
    #expect(event.summary == "Boarding pass")
  }
}

@Test func boardingPassLayoutRejectsLinearCodesAndMalformedData() {
  #expect(ScanPayload(sample, format: .code128).kind != .boardingPass)
  #expect(ScanPayload(String(sample.dropLast()), format: .qr).kind == .text)
  // Julian day out of range.
  #expect(BoardingPassParser.summary(sample.replacingOccurrences(of: "326J", with: "400J"), format: .qr) == nil)
  // Lowercase airport codes.
  #expect(BoardingPassParser.summary(sample.replacingOccurrences(of: "YULFRA", with: "yulfra"), format: .qr) == nil)
  // Conditional-field size must be hex.
  #expect(BoardingPassParser.summary(String(sample.dropLast(2)) + "ZZ", format: .qr) == nil)
  // The 53-character layout without a PNR is not a boarding pass.
  #expect(ScanPayload("M1" + "DOE/JOHN".padding(toLength: 20, withPad: " ", startingAt: 0) + "EORDLAXAA 00123273Y012A000421" + "00").kind == .text)
}

@Test func boardingPassesWithMultipleLegsAndConditionalDataStillParse() throws {
  let multiLeg = "M2DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 14D>5180      B29          0"
  let summary = try #require(BoardingPassParser.summary(multiLeg, format: .aztec))
  #expect(summary.origin == "YUL")
  #expect(summary.flight == "834")
}
