import Foundation

struct CodeFormat: Codable, Equatable, Hashable {
  let rawValue: String

  /// Vision symbology raw values all share this prefix, for example `VNBarcodeSymbologyQR`.
  private static let visionPrefix = "VNBarcodeSymbology"

  static let qr = CodeFormat(symbology: "QR")
  static let microQR = CodeFormat(symbology: "MicroQR")
  static let aztec = CodeFormat(symbology: "Aztec")
  static let dataMatrix = CodeFormat(symbology: "DataMatrix")
  static let pdf417 = CodeFormat(symbology: "PDF417")
  static let microPDF417 = CodeFormat(symbology: "MicroPDF417")
  static let ean13 = CodeFormat(symbology: "EAN13")
  static let ean8 = CodeFormat(symbology: "EAN8")
  static let upce = CodeFormat(symbology: "UPCE")
  static let itf14 = CodeFormat(symbology: "ITF14")
  static let gs1DataBar = CodeFormat(symbology: "GS1DataBar")
  static let gs1DataBarExpanded = CodeFormat(symbology: "GS1DataBarExpanded")
  static let gs1DataBarLimited = CodeFormat(symbology: "GS1DataBarLimited")
  static let code39 = CodeFormat(symbology: "Code39")
  static let code39Checksum = CodeFormat(symbology: "Code39Checksum")
  static let code39FullASCII = CodeFormat(symbology: "Code39FullASCII")
  static let code39FullASCIIChecksum = CodeFormat(symbology: "Code39FullASCIIChecksum")
  static let code93 = CodeFormat(symbology: "Code93")
  static let code93i = CodeFormat(symbology: "Code93i")
  static let code128 = CodeFormat(symbology: "Code128")

  init(rawValue: String) { self.rawValue = rawValue }

  private init(symbology: String) { rawValue = Self.visionPrefix + symbology }

  /// The Vision symbology without its framework prefix, for example `DataMatrix`.
  var symbology: String {
    rawValue.hasPrefix(Self.visionPrefix) ? String(rawValue.dropFirst(Self.visionPrefix.count)) : rawValue
  }

  /// Two-dimensional formats that can carry an IATA boarding pass.
  static let boardingPassFormats: Set<CodeFormat> = [.qr, .aztec, .dataMatrix, .pdf417]

  private static let names: [String: String] = [
    "QR": "QR", "MicroQR": "Micro QR", "Aztec": "Aztec", "DataMatrix": "Data Matrix",
    "PDF417": "PDF417", "MicroPDF417": "MicroPDF417", "EAN13": "EAN-13 / UPC-A",
    "EAN8": "EAN-8", "UPCE": "UPC-E", "ITF14": "ITF-14", "I2of5": "Interleaved 2 of 5",
    "I2of5Checksum": "Interleaved 2 of 5", "GS1DataBar": "GS1 DataBar",
    "GS1DataBarExpanded": "GS1 DataBar Expanded", "GS1DataBarLimited": "GS1 DataBar Limited",
    "MSIPlessey": "MSI Plessey", "Codabar": "Codabar",
    "Code39": "Code 39", "Code39Checksum": "Code 39 Checksum", "Code39FullASCII": "Code 39 Full ASCII",
    "Code39FullASCIIChecksum": "Code 39 Full ASCII Checksum", "Code93": "Code 93", "Code93i": "Code 93i",
    "Code128": "Code 128",
  ]

  /// Symbology names are proper names, so they are not translated.
  var name: String {
    let symbology = symbology
    return Self.names[symbology] ?? symbology.replacingOccurrences(of: "Code", with: "Code ")
  }

  /// Only retail identifiers with a valid GS1 check digit are sent to product lookup.
  func productCode(_ payload: String) -> String? {
    guard payload.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
    if self == .upce, let expanded = Self.expandUPCE(payload), Self.validGTIN(expanded) {
      return expanded
    }
    let expectedLength: Int
    switch self {
    case .ean13: expectedLength = 13
    case .ean8: expectedLength = 8
    case .itf14, .gs1DataBar, .gs1DataBarLimited: expectedLength = 14
    default: return nil
    }
    guard payload.count == expectedLength, Self.validGTIN(payload) else { return nil }
    return payload
  }

  private static func expandUPCE(_ value: String) -> String? {
    let digits = Array(value)
    guard digits.count == 8, ["0", "1"].contains(String(digits[0])) else { return nil }
    let ns = String(digits[0]), d = Array(digits[1...6]).map(String.init), check = String(digits[7])
    let body: String
    switch d[5] {
    case "0", "1", "2": body = d[0] + d[1] + d[5] + "00" + "00" + d[2] + d[3] + d[4]
    case "3": body = d[0] + d[1] + d[2] + "00" + "000" + d[3] + d[4]
    case "4": body = d[0] + d[1] + d[2] + d[3] + "0" + "0000" + d[4]
    default: body = d[0] + d[1] + d[2] + d[3] + d[4] + "0000" + d[5]
    }
    return ns + body + check
  }

  private static func validGTIN(_ value: String) -> Bool {
    let digits = value.compactMap(\.wholeNumberValue)
    guard digits.count == value.count, let check = digits.last else { return false }
    let weighted = digits.dropLast().reversed().enumerated().reduce(0) { sum, item in
      sum + item.element * (item.offset.isMultiple(of: 2) ? 3 : 1)
    }
    return (10 - weighted % 10) % 10 == check
  }
}
