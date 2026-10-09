import Foundation

/// IATA Bar Coded Boarding Pass (Resolution 792), mandatory first-leg fields.
/// Readable travel fields supplement the complete original data.
enum BoardingPassParser: PayloadKindParser {
  /// Character offsets of the mandatory unique and first-leg fields.
  enum Field {
    static let formatCode = 0
    static let legCount = 1
    static let passengerName = 2..<22
    static let electronicTicket = 22
    static let pnr = 23..<30
    static let origin = 30..<33
    static let destination = 33..<36
    static let carrier = 36..<39
    static let flight = 39..<44
    static let julianDay = 44..<47
    static let compartment = 47
    static let seat = 48..<52
    static let sequence = 52..<57
    static let passengerStatus = 57
    static let conditionalSize = 58..<60
  }
  static let minimumLength = 60

  struct Summary: Equatable {
    let origin: String
    let destination: String
    let carrier: String
    let flight: String
    let julianDay: Int
  }

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard let pass = summary(input.raw, format: input.format) else { return nil }
    let characters = Array(input.raw)
    func field(_ range: Range<Int>) -> String {
      String(characters[range]).trimmingCharacters(in: .whitespaces)
    }
    let details = [
      String(localized: "\(pass.origin) to \(pass.destination)"),
      "\(pass.carrier) \(pass.flight)",
      String(localized: "Day \(pass.julianDay) of the year"),
      String(localized: "Passenger: \(field(Field.passengerName))"),
      String(localized: "Booking reference: \(field(Field.pnr))"),
      String(localized: "Ticket indicator: \(String(characters[Field.electronicTicket]))"),
      String(localized: "Flight legs: \(String(characters[Field.legCount]))"),
      String(localized: "Cabin: \(String(characters[Field.compartment]))"),
      String(localized: "Seat: \(field(Field.seat))"),
      String(localized: "Check-in sequence: \(field(Field.sequence))"),
      String(localized: "Passenger status: \(String(characters[Field.passengerStatus]))"),
    ].joined(separator: "\n")
    return ParsedPayload(kind: .boardingPass, title: String(localized: "Boarding pass"), details: details,
      isSensitive: true, summary: "Boarding pass")
  }

  static func summary(_ raw: String, format: CodeFormat) -> Summary? {
    guard CodeFormat.boardingPassFormats.contains(format) else { return nil }
    let characters = Array(raw)
    guard characters.count >= minimumLength, characters.prefix(minimumLength).allSatisfy(\.isASCII),
      characters[Field.formatCode] == "M", ("1"..."4").contains(characters[Field.legCount]),
      characters[Field.passengerName].contains("/"),
      let day = Int(String(characters[Field.julianDay]).trimmingCharacters(in: .whitespaces)), (1...366).contains(day),
      Int(String(characters[Field.conditionalSize]), radix: 16) != nil else { return nil }
    let origin = String(characters[Field.origin]), destination = String(characters[Field.destination])
    guard isAirportCode(origin), isAirportCode(destination) else { return nil }
    let carrier = String(characters[Field.carrier]).trimmingCharacters(in: .whitespaces)
    let flightField = String(characters[Field.flight]).trimmingCharacters(in: .whitespaces)
    guard !carrier.isEmpty, carrier.allSatisfy({ $0.isLetter || $0.isNumber }),
      !flightField.isEmpty, flightField.allSatisfy({ $0.isLetter || $0.isNumber }) else { return nil }
    // "0834" is shown as "834"; an operational suffix letter such as "0834A" is kept.
    let digits = flightField.prefix { $0.isNumber }
    let significant = digits.drop { $0 == "0" }
    let number = significant.isEmpty && !digits.isEmpty ? "0" : String(significant)
    let flight = number + flightField.dropFirst(digits.count)
    return Summary(origin: origin, destination: destination, carrier: carrier, flight: flight, julianDay: day)
  }

  private static func isAirportCode(_ code: String) -> Bool {
    code.count == 3 && code.allSatisfy { $0 >= "A" && $0 <= "Z" }
  }
}
