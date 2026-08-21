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
  historyPlaceholder: 'Your scan history will appear here.',
  liveScanArea: 'Live camera scan area',
  copy: 'Copy',
  back: 'Back',
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
  historyPlaceholder: 'Tu historial de escaneos aparecerá aquí.',
  liveScanArea: 'Área de escaneo con cámara en vivo',
  copy: 'Copiar',
  back: 'Atrás',
};

export type MessageKey = keyof typeof en;

let currentLocale = 'en';

export function setLocale(locale: string): void {
  currentLocale = locale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function getLocale(): string {
  return currentLocale;
}

export function t(key: MessageKey): string {
  return (currentLocale === 'es' ? es : en)[key];
}
