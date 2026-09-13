import { resolveChromeSurface, systemStackUsesNativeChrome } from './chromeAppearance';

describe('chrome appearance (QLT-01)', () => {
  test('current OS uses Liquid Glass when available and transparency is allowed', () => {
    expect(
      resolveChromeSurface({
        tone: 'onMedia',
        liquidGlassAvailable: true,
        reduceTransparency: false,
        increaseContrast: false,
        reduceMotion: false,
      }),
    ).toMatchSnapshot('current-liquid-glass');
  });

  test('fallback without Liquid Glass uses opaque semantic fills, not translucent fake glass', () => {
    const surface = resolveChromeSurface({
      tone: 'onMedia',
      liquidGlassAvailable: false,
      reduceTransparency: false,
      increaseContrast: false,
      reduceMotion: false,
    });
    expect(surface.kind).toBe('semanticOpaque');
    expect(surface.backgroundColor).not.toMatch(/rgba?\([^)]+,\s*0?\.\d+\s*\)/i);
    expect(surface).toMatchSnapshot('fallback-semantic-opaque');
  });

  test('Reduced Transparency replaces Liquid Glass with an opaque semantic surface', () => {
    const surface = resolveChromeSurface({
      tone: 'onMedia',
      liquidGlassAvailable: true,
      reduceTransparency: true,
      increaseContrast: false,
      reduceMotion: false,
    });
    expect(surface.kind).toBe('semanticOpaque');
    expect(surface.backgroundColor).toBe('#1c1c1e');
    expect(surface).toMatchSnapshot('reduced-transparency');
  });

  test('Increase Contrast keeps hierarchy with high-contrast borders and fills', () => {
    const media = resolveChromeSurface({
      tone: 'onMedia',
      liquidGlassAvailable: false,
      reduceTransparency: false,
      increaseContrast: true,
      reduceMotion: false,
    });
    const canvas = resolveChromeSurface({
      tone: 'onCanvas',
      liquidGlassAvailable: false,
      reduceTransparency: false,
      increaseContrast: true,
      reduceMotion: false,
    });
    expect(media.borderWidth).toBeGreaterThanOrEqual(2);
    expect(media.contentColor).toBe('#fff');
    expect(media.backgroundColor).toBe('#000000');
    expect(canvas.borderWidth).toBeGreaterThanOrEqual(2);
    expect(canvas.contentColor).toBe('#000000');
    expect(canvas.backgroundColor).toBe('#ffffff');
    expect({ media, canvas }).toMatchSnapshot('increased-contrast');
  });

  test('navigation stays on the system Stack rather than a custom tab chrome replica', () => {
    expect(systemStackUsesNativeChrome()).toBe(true);
  });
});
