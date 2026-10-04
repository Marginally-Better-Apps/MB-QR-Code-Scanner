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
      let draft = route.payload.contactDraft
      var contact: CNContact?
      if draft?.source != .mecard {
        contact = (try? CNContactVCardSerialization.contacts(with: Data(route.payload.original.utf8)))?.first
      }
      if contact == nil, let draft { contact = Self.contact(from: draft) }
      let controller = CNContactViewController(forNewContact: contact)
      controller.delegate = context.coordinator
      return UINavigationController(rootViewController: controller)
    case .calendar:
      let controller = EKEventEditViewController()
      let store = EKEventStore()
      controller.eventStore = store
      let event = EKEvent(eventStore: store)
      if let draft = route.payload.calendarEventDraft {
        event.title = draft.title
        event.location = draft.location
        event.notes = draft.notes
        event.url = draft.url
        event.isAllDay = draft.isAllDay
        event.timeZone = draft.timeZone
        event.startDate = draft.start
        event.endDate = draft.end
      } else {
        event.title = route.payload.title
        event.startDate = Date()
        event.endDate = event.startDate.addingTimeInterval(CalendarEventDraft.defaultTimedDuration)
      }
      controller.event = event
      controller.editViewDelegate = context.coordinator
      return controller
    }
  }
  func updateUIViewController(_ controller: UIViewController, context: Context) {}

  /// Maps a MECARD to Contacts. Notes are omitted: writing them requires the Contacts notes entitlement.
  private static func contact(from draft: ContactDraft) -> CNContact {
    let contact = CNMutableContact()
    contact.givenName = draft.givenName
    contact.familyName = draft.familyName
    contact.nickname = draft.nickname
    if draft.givenName.isEmpty, draft.familyName.isEmpty { contact.givenName = draft.formattedName }
    contact.organizationName = draft.organization
    contact.phoneNumbers = draft.phones.enumerated().map { index, phone in
      CNLabeledValue(label: index == 0 ? CNLabelPhoneNumberMain : CNLabelOther, value: CNPhoneNumber(stringValue: phone))
    }
    contact.emailAddresses = draft.emails.map { CNLabeledValue(label: CNLabelOther, value: $0 as NSString) }
    contact.urlAddresses = draft.urls.map { CNLabeledValue(label: CNLabelURLAddressHomePage, value: $0 as NSString) }
    if let address = draft.address, !address.isEmpty {
      let postal = CNMutablePostalAddress()
      postal.street = [address.poBox, address.extended, address.street].filter { !$0.isEmpty }.joined(separator: "\n")
      postal.city = address.city
      postal.state = address.region
      postal.postalCode = address.postalCode
      postal.country = address.country
      contact.postalAddresses = [CNLabeledValue(label: CNLabelHome, value: postal)]
    }
    contact.birthday = draft.birthday
    return contact
  }

  final class Coordinator: NSObject, CNContactViewControllerDelegate, EKEventEditViewDelegate {
    let dismiss: () -> Void
    init(dismiss: @escaping () -> Void) { self.dismiss = dismiss }
    func contactViewController(_ viewController: CNContactViewController, didCompleteWith contact: CNContact?) { dismiss() }
    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { dismiss() }
  }
}
