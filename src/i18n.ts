const en = {
  scanner: 'Scanner',
  history: 'History',
  cameraAccess: 'Camera Access',
  cameraAccessIsOff: 'Camera Access Is Off',
  cameraAccessIsRestricted: 'Camera Access Is Restricted',
  cameraAccessRestrictedDescription:
    'Camera access is restricted by Screen Time or device management.',
  cameraUnavailable: 'Camera Unavailable',
  noCameraAvailable: 'No camera is available on this device.',
  allowCameraInSettings: 'Allow camera access in Settings to scan QR codes.',
  openSettings: 'Open Settings',
  readyToScan: 'Ready to Scan',
  pointCamera: 'Point the camera at a QR code. Scanning starts automatically.',
  cameraPurpose:
    'QR Scanner recognizes QR codes on this device. Camera frames are never uploaded or saved.',
  historyPlaceholder: 'Accepted scans appear here.',
  historyScanCta: 'Scan a QR code',
  historyToday: 'Today',
  historyYesterday: 'Yesterday',
  historyRedactedTitle: 'Sensitive scan',
  historyWifiTitle: 'Wi-Fi network',
  historySensitiveNotSaved: 'This sensitive code was not saved.',
  historyWifiNotSaved: 'The Wi-Fi network was not saved.',
  liveScanArea: 'Live camera scan area',
  scanTargetCoaching: 'Place code near here. Codes anywhere in view are recognized.',
  copy: 'Copy',
  open: 'Open',
  share: 'Share',
  openLink: 'Open link',
  openAppLink: 'Open app link',
  website: 'Website',
  appLink: 'App link',
  composeEmail: 'Compose',
  call: 'Call',
  sendSms: 'Message',
  openMap: 'Open Map',
  emailTo: 'To',
  emailSubject: 'Subject',
  emailBody: 'Body',
  phoneNumber: 'Phone',
  smsMessage: 'Message',
  geoLocation: 'Location',
  addContact: 'Add Contact',
  contactUntitled: 'Contact',
  addEvent: 'Add Event',
  back: 'Back',
  clear: 'Clear',
  showDetails: 'Show details',
  hideDetails: 'Hide details',
  scanResult: 'Scan result',
  codesFoundChoose: 'codes found · Choose',
  chooseCode: 'Choose',
  selectCode: 'Select a QR code',
  candidateCodes: 'Candidate QR codes',
  historyDelete: 'Delete',
  historyUndo: 'Undo',
  historyScanDeleted: 'Scan deleted',
  historyClearCount: 'Clear {count} scans',
  historyClearCountOne: 'Clear 1 scan',
  historyClearConfirmTitle: 'Clear all scans?',
  historyClearConfirmMessage: 'This removes {count} scans from this device.',
  historyClearConfirmMessageOne: 'This removes 1 scan from this device.',
  historyClearConfirm: 'Clear All',
  historyClearCancel: 'Cancel',
};

const es: typeof en = {
  scanner: 'Escáner',
  history: 'Historial',
  cameraAccess: 'Acceso a la cámara',
  cameraAccessIsOff: 'El acceso a la cámara está desactivado',
  cameraAccessIsRestricted: 'El acceso a la cámara está restringido',
  cameraAccessRestrictedDescription:
    'El acceso a la cámara está restringido por Tiempo en pantalla o la gestión del dispositivo.',
  cameraUnavailable: 'Cámara no disponible',
  noCameraAvailable: 'No hay ninguna cámara disponible en este dispositivo.',
  allowCameraInSettings:
    'Permite el acceso a la cámara en Ajustes para escanear códigos QR.',
  openSettings: 'Abrir Ajustes',
  readyToScan: 'Listo para escanear',
  pointCamera: 'Apunta la cámara a un código QR. El escaneo comienza automáticamente.',
  cameraPurpose:
    'QR Scanner reconoce códigos QR en este dispositivo. Los fotogramas de la cámara nunca se suben ni se guardan.',
  historyPlaceholder: 'Los escaneos aceptados aparecen aquí.',
  historyScanCta: 'Escanear un código QR',
  historyToday: 'Hoy',
  historyYesterday: 'Ayer',
  historyRedactedTitle: 'Escaneo confidencial',
  historyWifiTitle: 'Red Wi-Fi',
  historySensitiveNotSaved: 'Este código confidencial no se guardó.',
  historyWifiNotSaved: 'La red Wi-Fi no se guardó.',
  liveScanArea: 'Área de escaneo con cámara en vivo',
  scanTargetCoaching:
    'Coloca el código cerca de aquí. Se reconocen los códigos en cualquier parte de la vista.',
  copy: 'Copiar',
  open: 'Abrir',
  share: 'Compartir',
  openLink: 'Abrir enlace',
  openAppLink: 'Abrir enlace de app',
  website: 'Sitio web',
  appLink: 'Enlace de app',
  composeEmail: 'Redactar',
  call: 'Llamar',
  sendSms: 'Mensaje',
  openMap: 'Abrir mapa',
  emailTo: 'Para',
  emailSubject: 'Asunto',
  emailBody: 'Cuerpo',
  phoneNumber: 'Teléfono',
  smsMessage: 'Mensaje',
  geoLocation: 'Ubicación',
  addContact: 'Añadir contacto',
  contactUntitled: 'Contacto',
  addEvent: 'Añadir evento',
  back: 'Atrás',
  clear: 'Borrar',
  showDetails: 'Mostrar detalles',
  hideDetails: 'Ocultar detalles',
  scanResult: 'Resultado del escaneo',
  codesFoundChoose: 'códigos encontrados · Elegir',
  chooseCode: 'Elegir',
  selectCode: 'Selecciona un código QR',
  candidateCodes: 'Códigos QR candidatos',
  historyDelete: 'Eliminar',
  historyUndo: 'Deshacer',
  historyScanDeleted: 'Escaneo eliminado',
  historyClearCount: 'Borrar {count} escaneos',
  historyClearCountOne: 'Borrar 1 escaneo',
  historyClearConfirmTitle: '¿Borrar todos los escaneos?',
  historyClearConfirmMessage: 'Esto elimina {count} escaneos de este dispositivo.',
  historyClearConfirmMessageOne: 'Esto elimina 1 escaneo de este dispositivo.',
  historyClearConfirm: 'Borrar todo',
  historyClearCancel: 'Cancelar',
};

export type MessageKey = keyof typeof en;

let currentLocale = 'en';

export function setLocale(locale: string): void {
  currentLocale = locale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function getLocale(): string {
  return currentLocale;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let value = (currentLocale === 'es' ? es : en)[key];
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}
