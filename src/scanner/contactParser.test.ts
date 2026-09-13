import { parseQRPayload } from './payloadParser';

function contactOf(raw: string) {
  const parsed = parseQRPayload(raw);
  expect(parsed.content.kind).toBe('contact');
  if (parsed.content.kind !== 'contact') {
    throw new Error('expected contact');
  }
  return { parsed, contact: parsed.content };
}

describe('contact-card payloads (ACT-04)', () => {
  test('vCard 3 parses name, org, phones, emails, address, and URL', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Jane Doe',
      'N:Doe;Jane;;;',
      'ORG:Acme Labs',
      'TEL;TYPE=WORK:+14155552671',
      'TEL;TYPE=CELL:+14155550000',
      'EMAIL;TYPE=WORK:jane@example.com',
      'EMAIL;TYPE=HOME:jane.home@example.com',
      'ADR;TYPE=WORK:;;1 Market St;San Francisco;CA;94105;USA',
      'URL:https://acme.example',
      'END:VCARD',
    ].join('\n');

    const { parsed, contact } = contactOf(raw);
    expect(contact.name).toBe('Jane Doe');
    expect(contact.organization).toBe('Acme Labs');
    expect(contact.phones).toEqual(['+14155552671', '+14155550000']);
    expect(contact.emails).toEqual(['jane@example.com', 'jane.home@example.com']);
    expect(contact.addresses).toEqual(['1 Market St, San Francisco, CA, 94105, USA']);
    expect(contact.urls).toEqual(['https://acme.example']);
    expect(contact.phone).toBe('+14155552671');
    expect(contact.email).toBe('jane@example.com');
    expect(parsed.originalPayload).toBe(raw);
    expect(parsed.actions).toEqual(expect.arrayContaining(['addContact', 'copy', 'share']));
  });

  test('vCard 4 folded lines and escaped characters stay intact', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:José Müller',
      'ORG:North',
      '  Shore\\, Inc.',
      'TEL:+14155552671',
      'NOTE:This unknown-to-actions field must not drop the card',
      'END:VCARD',
    ].join('\n');

    const { contact, parsed } = contactOf(raw);
    expect(contact.name).toBe('José Müller');
    expect(contact.organization).toBe('North Shore, Inc.');
    expect(contact.phones).toEqual(['+14155552671']);
    expect(parsed.originalPayload).toBe(raw);
  });

  test('unknown vCard fields are ignored without losing known fields', () => {
    const raw = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Pat Lee',
      'X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Skip',
      'IMPP:xmpp:pat@example.com',
      'TEL:+14155550100',
      'END:VCARD',
    ].join('\n');

    const { contact, parsed } = contactOf(raw);
    expect(contact.name).toBe('Pat Lee');
    expect(contact.phones).toEqual(['+14155550100']);
    expect(parsed.originalPayload).toContain('X-ANDROID-CUSTOM');
  });

  test('MECARD parses escaped name plus org, address, and URL', () => {
    const raw =
      'MECARD:N:Doe\\;John;ORG:Acme;TEL:+14155552671;EMAIL:john@example.com;ADR:1 Market St, SF;URL:https://john.example;;';
    const { contact } = contactOf(raw);
    expect(contact.name).toBe('Doe;John');
    expect(contact.organization).toBe('Acme');
    expect(contact.phones).toEqual(['+14155552671']);
    expect(contact.emails).toEqual(['john@example.com']);
    expect(contact.addresses).toEqual(['1 Market St, SF']);
    expect(contact.urls).toEqual(['https://john.example']);
  });

  test('malformed cards fall back without losing the raw value', () => {
    const raw = 'BEGIN:VCARD\nFN:No End';
    const parsed = parseQRPayload(raw);
    expect(parsed.content.kind).toBe('text');
    if (parsed.content.kind === 'text') {
      expect(parsed.content.text).toBe(raw);
    }
    expect(parsed.originalPayload).toBe(raw);
  });
});
