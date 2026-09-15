import fs from 'node:fs';
import path from 'node:path';

import appJson from '../app.json';
import iconJson from '../assets/expo.icon/icon.json';

describe('app artwork', () => {
  it('uses the QR mark for a square, legible native splash', () => {
    const splashPlugin = appJson.expo.plugins.find(
      (plugin): plugin is [string, { backgroundColor: string; image: string; imageWidth: number }] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );

    expect(splashPlugin).toEqual([
      'expo-splash-screen',
      {
        backgroundColor: '#10152F',
        image: './assets/images/splash-icon.png',
        imageWidth: 128,
      },
    ]);

    const splash = fs.readFileSync(path.join(__dirname, '../assets/images/splash-icon.png'));
    expect(splash.subarray(1, 4).toString()).toBe('PNG');
    expect(splash.readUInt32BE(16)).toBe(1024);
    expect(splash.readUInt32BE(20)).toBe(1024);
  });

  it('gives the app icon mark enough space inside the iOS mask', () => {
    expect(iconJson.groups[0].layers[0].position.scale).toBe(0.72);
  });
});
