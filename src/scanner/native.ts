import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import type { AVFoundationScannerPlatform } from './avFoundation';
import type { CameraAccessProviding, CameraAuthorization } from './types';
import type { VisionKitScannerPlatform } from './visionKit';

export type NativeCapabilities = {
  dataScannerSupported: boolean;
  dataScannerAvailable: boolean;
  authorization: CameraAuthorization;
  cameraAvailable: boolean;
  allowsFixtures: boolean;
  cameraFixture?: string;
  scannerFixture?: string;
  nativeImageFixture?: string;
};

type ScannerEngineNativeModule = {
  getCapabilities(): NativeCapabilities;
  requestAuthorization(): Promise<CameraAuthorization>;
  refreshAuthorization(): CameraAuthorization;
  openSettings(): void;
};

const nativeModule: ScannerEngineNativeModule | null = (() => {
  try {
    return requireNativeModule<ScannerEngineNativeModule>('ScannerEngine');
  } catch {
    return null;
  }
})();

export function getNativeModule(): ScannerEngineNativeModule | null {
  return nativeModule;
}

export function nativeCameraAccess(): CameraAccessProviding {
  const module = getNativeModule();
  if (!module) {
    throw new Error('ScannerEngine native module is unavailable');
  }

  return {
    get authorization() {
      return module.getCapabilities().authorization;
    },
    get cameraAvailable() {
      return module.getCapabilities().cameraAvailable;
    },
    async requestAuthorization() {
      await module.requestAuthorization();
    },
    refreshAuthorization() {
      module.refreshAuthorization();
    },
  };
}

export function nativeVisionKitPlatform(): VisionKitScannerPlatform {
  const module = getNativeModule();
  return {
    get isSupported() {
      return module?.getCapabilities().dataScannerSupported === true;
    },
    get isAvailable() {
      return module?.getCapabilities().dataScannerAvailable === true;
    },
    makeController() {
      throw new Error('VisionKit controller is owned by ScannerPreviewView');
    },
  };
}

export function nativeAVFoundationPlatform(): AVFoundationScannerPlatform {
  const module = getNativeModule();
  return {
    get isAuthorized() {
      return module?.getCapabilities().authorization === 'authorized';
    },
    makeController() {
      throw new Error('AVFoundation controller is owned by ScannerPreviewView');
    },
  };
}

export type ScannerPreviewNativeProps = ViewProps & {
  engine: 'visionkit' | 'avfoundation';
  running: boolean;
  imageFixture?: string;
  onObservations?: (event: {
    nativeEvent: {
      items: {
        payload: string | null;
        bounds: { x: number; y: number; width: number; height: number };
      }[];
    };
  }) => void;
};

export const ScannerPreviewView: ComponentType<ScannerPreviewNativeProps> | null =
  (() => {
    try {
      return requireNativeViewManager<ScannerPreviewNativeProps>('ScannerEngine');
    } catch {
      return null;
    }
  })();
