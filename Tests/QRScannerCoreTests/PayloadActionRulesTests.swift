import Foundation
import Testing
@testable import QRScannerCore

private func actions(_ raw: String, format: CodeFormat = .qr, availability: OpenAvailability = .unknown) -> PayloadActionSet {
  PayloadActionRules.actions(for: ScanPayload(raw, format: format), availability: availability)
}

@Test func webLinksOpenDirectlyAndCanBeCopiedAndShared() {
  let set = actions("https://example.com/menu")
  #expect(set.actions == [.open, .copy, .share])
  #expect(set.primary == .open)
  #expect(set.openUnavailableReason == nil)
  #expect(PayloadActionRules.handoff(for: ScanPayload("https://example.com/menu")) == .direct)
  #expect(PayloadActionRules.queryableScheme(for: ScanPayload("https://example.com/menu")) == nil)
}

@Test func everyCustomSchemeOpenIsConfirmed() {
  let raws = ["myapp://pay?amount=10", "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=1",
    "shortcuts://run-shortcut?name=Wipe", "x-safari-https://example.com", "facetime:someone@example.com",
    "ms-word:ofe|u|https://evil.example/doc.docx", "spotify:track:123"]
  var customSchemes = 0
  for raw in raws {
    let payload = ScanPayload(raw)
    guard payload.openURL != nil else { continue }
    #expect(payload.kind == .customScheme, "\(raw)")
    let handoff = PayloadActionRules.handoff(for: payload)
    #expect(handoff?.needsConfirmation == true, "\(raw)")
    customSchemes += 1
  }
  #expect(customSchemes >= 5)
}

@Test func appLinkConfirmationNamesSchemeAndShowsSanitizedTarget() throws {
  let payload = ScanPayload("myapp://pay?amount=10")
  #expect(PayloadActionRules.handoff(for: payload) == .appLink(scheme: "myapp", target: "myapp://pay?amount=10", isPayment: false))
  #expect(actions("myapp://pay?amount=10").primary == .open)

  let long = "myapp://x?pad=" + String(repeating: "a", count: 500) + "&input=danger"
  guard case .appLink(_, let target, _) = PayloadActionRules.handoff(for: ScanPayload(long)) else {
    Issue.record("expected app link")
    return
  }
  #expect(target.count <= PayloadActionRules.confirmationTargetLimit)
  #expect(target.hasPrefix("myapp://x?pad="))
  #expect(target.contains("…"))
  // Padding cannot hide trailing parameters.
  #expect(target.hasSuffix("&input=danger"))
}

@Test func paymentSchemesGetPaymentWordingWithoutSubstringHeuristics() {
  guard case .appLink(let scheme, _, let isPayment) = PayloadActionRules.handoff(for: ScanPayload("bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=1")) else {
    Issue.record("expected app link")
    return
  }
  #expect(scheme == "bitcoin")
  #expect(isPayment)
  #expect(PayloadActionRules.handoff(for: ScanPayload("UPI://pay?pa=a@b")) == .appLink(scheme: "upi", target: "UPI://pay?pa=a@b", isPayment: true))
  // "pay" in the path no longer decides anything.
  #expect(PayloadActionRules.handoff(for: ScanPayload("myapp://pay")) == .appLink(scheme: "myapp", target: "myapp://pay", isPayment: false))
}

@Test func unopenableAppLinksFallBackToCopyAndExplain() {
  let set = actions("myapp://open", availability: .unavailable)
  #expect(set.actions == [.copy, .share])
  #expect(set.primary == .copy)
  #expect(set.openUnavailableReason == .appNotInstalled)
}

@Test func authenticatorLinksAreConfirmedAndCheckable() {
  let raw = "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
  let payload = ScanPayload(raw)
  #expect(payload.openURL != nil)
  #expect(PayloadActionRules.handoff(for: payload) == .authenticator)
  #expect(PayloadActionRules.queryableScheme(for: payload) == "otpauth")
  #expect(actions(raw).actions == [.open, .copy, .share])
  #expect(actions(raw).primary == .open)
  let unavailable = actions(raw, availability: .unavailable)
  #expect(unavailable.actions == [.copy, .share])
  #expect(unavailable.primary == .copy)
  #expect(unavailable.openUnavailableReason == .authenticator)
}

@Test func passkeyHandoffsAreConfirmedAndCheckable() {
  let raw = "FIDO:/1234567890123456789"
  let payload = ScanPayload(raw)
  #expect(payload.openURL != nil)
  #expect(PayloadActionRules.handoff(for: payload) == .passkey)
  #expect(PayloadActionRules.queryableScheme(for: payload) == "fido")
  #expect(actions(raw, availability: .available).actions == [.open, .copy, .share])
  #expect(actions(raw, availability: .unavailable).openUnavailableReason == .passkey)
}

@Test func authenticatorExportsAndSecretsOfferCopyAndShare() {
  #expect(actions("otpauth-migration://offline?data=abc").actions == [.copy, .share])
  #expect(actions("-----BEGIN PRIVATE KEY-----").actions == [.copy, .share])
}

@Test func wifiCopiesAndSharesTheCompleteCode() {
  let raw = "WIFI:S:Home;T:WPA;P:hunter2;;"
  let payload = ScanPayload(raw)
  let set = actions(raw)
  #expect(set.actions == [.copyPassword, .copy, .share])
  #expect(set.primary == .copyPassword)
  #expect(PayloadActionRules.clipboardText(for: .copyPassword, payload: payload) == "hunter2")
  #expect(PayloadActionRules.clipboardText(for: .copy, payload: payload) == raw)
  #expect(actions("WIFI:S:Cafe;T:nopass;;").actions == [.copy, .share])
  #expect(actions("WIFI:T:nopass;;").actions == [.copy, .share])
}

@Test func structuredCodesOfferTheirNativeAction() {
  let product = actions("4006381333931", format: CodeFormat(rawValue: "VNBarcodeSymbologyEAN13"))
  #expect(product.actions == [.lookup, .copy, .share])
  #expect(product.primary == .lookup)
  #expect(actions("BEGIN:VCARD\nFN:Ada\nEND:VCARD").primary == .addContact)
  #expect(actions("BEGIN:VEVENT\nSUMMARY:Launch\nDTSTART:20260101T100000Z\nEND:VEVENT").primary == .addEvent)
  #expect(actions("Hello").actions == [.copy, .share])
  #expect(PayloadActionRules.clipboardText(for: .copy, payload: ScanPayload("Hello")) == "Hello")
  #expect(PayloadActionRules.clipboardText(for: .share, payload: ScanPayload("Hello")) == nil)
}

@Test func linkDisplayKeepsTheRealDomainVisible() throws {
  let phishing = try #require(LinkDisplay(ScanPayload("https://accounts.google.com.signin.verify-session.security-check.example-evil.ru/oauth")))
  #expect(phishing.host == "accounts.google.com.signin.verify-session.security-check.example-evil.ru")
  #expect(phishing.path == "/oauth")
  #expect(!phishing.isInsecure)

  let insecure = try #require(LinkDisplay(ScanPayload("HTTP://PayPaI.Example.com:8080/a?b=1")))
  #expect(insecure.isInsecure)
  #expect(insecure.host == "paypai.example.com:8080")
  #expect(insecure.path == "/a?b=1")

  let bare = try #require(LinkDisplay(ScanPayload("https://example.com/")))
  #expect(bare.path.isEmpty)
  #expect(bare.hostAndPath == "example.com")
  #expect(LinkDisplay(ScanPayload("https://example.com/native-image-fixture"))?.hostAndPath == "example.com/native-image-fixture")
  #expect(LinkDisplay(ScanPayload("myapp://x")) == nil)
}
