// Writes a self-contained HTML sheet of labelled codes for physical-device testing.
// Usage: swift scripts/make-test-sheet.swift [output.html]   (default: artifacts/test-sheet.html)
// Open it on a Mac or print it, then scan each code with the phone and compare against `expect`.
// Every credential below is a public test value. Never put real secrets on a test sheet.
import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins

struct Sample {
  let section: String
  let title: String
  let payload: String
  let expect: String
  var filter = "CIQRCodeGenerator"
}

let boardingPass = "M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100"
let seedPhrase = "abandon ability able about above absent absorb abstract absurd abuse access accident"
let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXRlc3Q"

let samples: [Sample] = [
  Sample(section: "Links", title: "HTTPS link", payload: "https://example.com/hello",
         expect: "Link. Host on its own line, Open Link quick action, saved to History."),
  Sample(section: "Links", title: "Insecure link (uppercase)", payload: "HTTP://example.com/insecure",
         expect: "Shows Not Secure."),
  Sample(section: "Links", title: "Long look-alike host",
         payload: "https://accounts.google.com.signin.verify-session.security-check.example-evil.ru/oauth",
         expect: "Host truncates from the start so example-evil.ru stays visible."),
  Sample(section: "Links", title: "Userinfo spoof", payload: "https://apple.com@evil.example/",
         expect: "Plain text, never a link."),
  Sample(section: "Links", title: "Punycode host", payload: "https://аpple.com/",
         expect: "Host displays as xn--pple-43d.com."),
  Sample(section: "Links", title: "Reset link with token", payload: "https://example.com/reset?token=abc123&lang=en",
         expect: "Opens with the full link. History row has no query string."),
  Sample(section: "Links", title: "Bare host with port", payload: "example.com:8080/path",
         expect: "Web link."),
  Sample(section: "Links", title: "File name, not a link", payload: "notes.txt",
         expect: "Plain text."),
  Sample(section: "App links", title: "Custom scheme", payload: "myapp://open?item=42",
         expect: "Open asks for confirmation and names the scheme. Without the app: App not installed message."),
  Sample(section: "App links", title: "Shortcuts", payload: "shortcuts://run-shortcut?name=Test",
         expect: "Confirmation before Shortcuts opens."),
  Sample(section: "App links", title: "Payment", payload: "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.0001",
         expect: "Open Payment Link? confirmation."),
  Sample(section: "App links", title: "Blocked scheme", payload: "javascript:alert(1)",
         expect: "Plain text, no Open action."),
  Sample(section: "Communication", title: "Email", payload: "mailto:help@example.com?subject=Hi&body=Test",
         expect: "Compose opens Mail with subject and body."),
  Sample(section: "Communication", title: "Phone", payload: "tel:+15555550123",
         expect: "Call, number shown grouped."),
  Sample(section: "Communication", title: "Carrier code", payload: "tel:*21*5555550123#",
         expect: "Plain text, never dials."),
  Sample(section: "Communication", title: "SMS", payload: "SMSTO:+15555550123:Hello there",
         expect: "Text Message with the body prefilled."),
  Sample(section: "Communication", title: "Location", payload: "geo:37.3349,-122.0090;u=35",
         expect: "Open Map in Apple Maps."),
  Sample(section: "Contacts & events", title: "vCard", payload: """
    BEGIN:VCARD
    VERSION:3.0
    N:Appleseed;Jane
    FN:Jane Appleseed
    ORG:Example Co
    TEL:+15555550123
    EMAIL:jane@example.com
    END:VCARD
    """, expect: "Readable summary. Add Contact opens the system editor without a permission prompt."),
  Sample(section: "Contacts & events", title: "MECARD (repeated fields)",
         payload: "MECARD:N:Appleseed,John;ORG:Example Co;TEL:+15555550100;TEL:+15555550101;EMAIL:john@example.com;URL:https://example.com;;",
         expect: "Both phone numbers, org, and URL in the new contact."),
  Sample(section: "Contacts & events", title: "Timed event with TZID", payload: """
    BEGIN:VCALENDAR
    BEGIN:VEVENT
    SUMMARY:Launch review
    DTSTART;TZID=America/New_York:20261201T100000
    DTEND;TZID=America/New_York:20261201T110000
    LOCATION:Room 1
    END:VEVENT
    END:VCALENDAR
    """, expect: "10:00–11:00 New York time, converted to your zone in Add Event."),
  Sample(section: "Contacts & events", title: "All-day event", payload: """
    BEGIN:VEVENT
    SUMMARY:Holiday
    DTSTART;VALUE=DATE:20261225
    DTEND;VALUE=DATE:20261226
    END:VEVENT
    """, expect: "Exactly one all-day day in Calendar."),
  Sample(section: "Wi-Fi", title: "WPA network", payload: "WIFI:T:WPA;S:Test Network;P:not-a-real-password;;",
         expect: "Security WPA/WPA2/WPA3, password masked, Copy Password, no Share, History row says details not saved."),
  Sample(section: "Wi-Fi", title: "Hidden open network", payload: "WIFI:T:nopass;S:\"Quoted SSID\";H:true;;",
         expect: "Open, Hidden network, SSID without quotes."),
  Sample(section: "Sensitive (never saved)", title: "Authenticator setup",
         payload: "otpauth://totp/Example:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
         expect: "No Copy or Share. Open asks for confirmation. Cleared when the app goes to the background."),
  Sample(section: "Sensitive (never saved)", title: "Boarding pass", payload: boardingPass,
         expect: "YUL to FRA summary. History row: details not saved."),
  Sample(section: "Sensitive (never saved)", title: "Boarding pass (Aztec)", payload: boardingPass,
         expect: "Same as above for Aztec.", filter: "CIAztecCodeGenerator"),
  Sample(section: "Sensitive (never saved)", title: "Boarding pass (PDF417)", payload: boardingPass,
         expect: "Same as above for PDF417.", filter: "CIPDF417BarcodeGenerator"),
  Sample(section: "Sensitive (never saved)", title: "Recovery phrase", payload: seedPhrase,
         expect: "Recovery phrase, redacted."),
  Sample(section: "Sensitive (never saved)", title: "JWT", payload: jwt,
         expect: "Access token, redacted."),
  Sample(section: "Text & robustness", title: "Emoji and multi-line", payload: "Family 👨‍👩‍👧\nSecond line",
         expect: "Emoji intact, title on one line, no replacement characters."),
  Sample(section: "Text & robustness", title: "Bidi override", payload: "invoice\u{202E}fdp.exe",
         expect: "Override shown as a replacement character, not reversed text."),
  Sample(section: "Text & robustness", title: "Webauthn link is a link", payload: "https://webauthn.io",
         expect: "Normal link, not a sign-in code."),
  Sample(section: "Text & robustness", title: "Slow-regex stress",
         payload: String(repeating: "BEGIN ", count: 400) + "END",
         expect: "Appears instantly. Camera and scrolling stay smooth."),
  Sample(section: "Barcodes", title: "Code 128", payload: "QR-SCANNER-128",
         expect: "Code 128 label.", filter: "CICode128BarcodeGenerator"),
]

func pngData(for sample: Sample) -> Data? {
  guard let filter = CIFilter(name: sample.filter) else { return nil }
  filter.setValue(Data(sample.payload.utf8), forKey: "inputMessage")
  guard let output = filter.outputImage else { return nil }
  let scale: CGFloat = sample.filter == "CICode128BarcodeGenerator" || sample.filter == "CIPDF417BarcodeGenerator" ? 3 : 8
  let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  guard let image = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
  return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
}

func escape(_ text: String) -> String {
  text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
    .replacingOccurrences(of: ">", with: "&gt;")
}

var html = """
  <!doctype html><meta charset="utf-8"><title>QR Scanner test sheet</title>
  <style>body{font:14px -apple-system,sans-serif;margin:24px}h2{margin-top:32px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}
  .card{break-inside:avoid;border:1px solid #ddd;border-radius:12px;padding:16px}
  img{image-rendering:pixelated;max-width:100%;background:#fff;padding:12px}
  code{display:block;white-space:pre-wrap;word-break:break-all;color:#555;font-size:11px}</style>
  <h1>QR Scanner physical test sheet</h1>
  <p>Scan each code and check the expectation. Retail EAN/UPC codes: use real packaged products.</p>
  """
var currentSection = ""
for sample in samples {
  if sample.section != currentSection {
    if !currentSection.isEmpty { html += "</div>" }
    currentSection = sample.section
    html += "<h2>\(escape(sample.section))</h2><div class=grid>"
  }
  let image = pngData(for: sample).map { "<img src=\"data:image/png;base64,\($0.base64EncodedString())\">" }
    ?? "<p>(generator unavailable)</p>"
  let shown = sample.payload.count > 160 ? String(sample.payload.prefix(160)) + "…" : sample.payload
  html += "<div class=card><b>\(escape(sample.title))</b>\(image)<p>\(escape(sample.expect))</p><code>\(escape(shown))</code></div>"
}
html += "</div>"

let output = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "artifacts/test-sheet.html")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
try html.write(to: output, atomically: true, encoding: .utf8)
print("Wrote \(samples.count) codes to \(output.path)")
