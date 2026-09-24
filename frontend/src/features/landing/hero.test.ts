import { describe, expect, it } from 'vitest';
import { createNetwork, findPath } from './heroNetwork';
import { decideHeroMode, type HeroEnvironment } from './heroSupport';

const capable: HeroEnvironment = {
  reducedMotion: false,
  saveData: false,
  deviceMemory: 8,
  webgl: true,
};

describe('decideHeroMode (PRD section 7 fallbacks)', () => {
  it('uses the 3D hero on a capable device', () => {
    expect(decideHeroMode(capable)).toBe('3d');
  });

  it('uses the 3D hero when the browser does not report memory (Safari, Firefox)', () => {
    expect(decideHeroMode({ ...capable, deviceMemory: undefined })).toBe('3d');
  });

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['Data Saver', { saveData: true }],
    ['low device memory', { deviceMemory: 2 }],
    ['no WebGL', { webgl: false }],
  ])('falls back to the still image with %s', (_, change) => {
    expect(decideHeroMode({ ...capable, ...change })).toBe('static');
  });
});

describe('hero network', () => {
  it('is the same on every visit', () => {
    expect(createNetwork()).toEqual(createNetwork());
  });

  it('can reach every target from the hub along its links', () => {
    const network = createNetwork();
    expect(network.targets.length).toBeGreaterThan(2);
    for (const target of network.targets) {
      const path = findPath(network, network.hub, target);
      expect(path[0]).toBe(network.hub);
      expect(path.at(-1)).toBe(target);
      expect(path.length).toBeGreaterThan(2);
    }
  });
});
