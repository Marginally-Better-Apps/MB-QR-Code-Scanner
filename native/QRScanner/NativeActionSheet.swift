import SwiftUI
import ContactsUI
import EventKitUI

struct ActionRoute: Identifiable {
  enum Kind { case share, contact, calendar }
  let id = UUID()
  let kind: Kind
  let payload: ScanPayload
}

struct NativeActionSheet: UIViewControllerRepresentable {
  let route: ActionRoute
  @Environment(\.dismiss) private var dismiss

  func makeCoordinator() -> Coordinator { Coordinator(dismiss: { dismiss() }) }
  func makeUIViewController(context: Context) -> UIViewController {
    switch route.kind {
    case .share:
      return UIActivityViewController(activityItems: [route.payload.original], applicationActivities: nil)
    case .contact:
      let contact: CNContact?
      if route.payload.original.lowercased().hasPrefix("mecard:") {
        let fields = ScanPayload.wifiFields(String(route.payload.original.dropFirst(7)))
        let newContact = CNMutableContact()
        let name = (fields["N"] ?? "").components(separatedBy: ",")
        newContact.familyName = name.first ?? ""
        newContact.givenName = name.count > 1 ? name[1] : ""
        if let phone = fields["TEL"] { newContact.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMain, value: CNPhoneNumber(stringValue: phone))] }
        if let email = fields["EMAIL"] { newContact.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: email as NSString)] }
        if let address = fields["ADR"] {
          let postal = CNMutablePostalAddress()
          postal.street = address
          newContact.postalAddresses = [CNLabeledValue(label: CNLabelHome, value: postal)]
        }
        contact = newContact
      } else {
        contact = (try? CNContactVCardSerialization.contacts(with: Data(route.payload.original.utf8)))?.first
      }
      let controller = CNContactViewController(forNewContact: contact)
      controller.delegate = context.coordinator
      return UINavigationController(rootViewController: controller)
    case .calendar:
      let controller = EKEventEditViewController()
      let store = EKEventStore()
      controller.eventStore = store
      let event = EKEvent(eventStore: store)
      let fields = ScanPayload.lineFields(route.payload.original)
      event.title = fields["SUMMARY"] ?? route.payload.title
      event.location = fields["LOCATION"]
      event.notes = fields["DESCRIPTION"]
      event.url = fields["URL"].flatMap { ScanPayload($0).openURL }
      let start = CalendarDate.parse(fields["DTSTART"], raw: route.payload.original, name: "DTSTART")
      event.startDate = start?.date ?? Date()
      event.isAllDay = start?.allDay ?? false
      event.timeZone = start?.timeZone
      event.endDate = CalendarDate.parse(fields["DTEND"], raw: route.payload.original, name: "DTEND")?.date
        ?? event.startDate.addingTimeInterval(event.isAllDay ? 86400 : 3600)
      controller.event = event
      controller.editViewDelegate = context.coordinator
      return controller
    }
  }
  func updateUIViewController(_ controller: UIViewController, context: Context) {}

  final class Coordinator: NSObject, CNContactViewControllerDelegate, EKEventEditViewDelegate {
    let dismiss: () -> Void
    init(dismiss: @escaping () -> Void) { self.dismiss = dismiss }
    func contactViewController(_ viewController: CNContactViewController, didCompleteWith contact: CNContact?) { dismiss() }
    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { dismiss() }
  }
}
