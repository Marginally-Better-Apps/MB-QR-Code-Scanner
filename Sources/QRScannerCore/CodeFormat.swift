import Foundation

struct CodeFormat: Codable, Equatable, Hashable {
  let rawValue: String
  static let qr = CodeFormat(rawValue: "VNBarcodeSymbologyQR")

  var name: String {
    let suffix = rawValue.replacingOccurrences(of: "VNBarcodeSymbology", with: "")
    return [
      "QR": "QR", "MicroQR": "Micro QR", "Aztec": "Aztec", "DataMatrix": "Data Matrix",
      "PDF417": "PDF417", "MicroPDF417": "MicroPDF417", "EAN13": "EAN-13 / UPC-A",
      "EAN8": "EAN-8", "UPCE": "UPC-E", "ITF14": "ITF-14", "I2of5": "Interleaved 2 of 5",
      "I2of5Checksum": "Interleaved 2 of 5", "GS1DataBar": "GS1 DataBar",
      "GS1DataBarExpanded": "GS1 DataBar Expanded", "GS1DataBarLimited": "GS1 DataBar Limited",
      "MSIPlessey": "MSI Plessey", "Codabar": "Codabar"
    ][suffix] ?? suffix.replacingOccurrences(of: "Code", with: "Code ")
  }

  /// Only retail identifiers with a valid GS1 check digit are sent to product lookup.
  func productCode(_ payload: String) -> String? {
    let suffix = rawValue.replacingOccurrences(of: "VNBarcodeSymbology", with: "")
    guard payload.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
    if suffix == "UPCE", let expanded = Self.expandUPCE(payload), Self.validGTIN(expanded) {
      return expanded
    }
    let expectedLength: Int
    switch suffix {
    case "EAN13": expectedLength = 13
    case "EAN8": expectedLength = 8
    case "ITF14", "GS1DataBar", "GS1DataBarLimited": expectedLength = 14
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
