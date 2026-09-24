// Decides whether the landing page may use the animated 3D hero, or must show the still image.
// PRD section 7: the static SVG is used when the user prefers reduced motion, has "Data Saver"
// on, has a low-memory device, or the browser has no WebGL.

export interface HeroEnvironment {
  reducedMotion: boolean;
  saveData: boolean;
  /** GB of device memory as reported by the browser (only Chromium reports it). */
  deviceMemory: number | undefined;
  webgl: boolean;
}

export type HeroMode = 'static' | '3d';

/** Devices reporting less than this many GB get the still image. */
export const MIN_DEVICE_MEMORY_GB = 4;

export function decideHeroMode(env: HeroEnvironment): HeroMode {
  if (env.reducedMotion || env.saveData || !env.webgl) return 'static';
  if (env.deviceMemory !== undefined && env.deviceMemory < MIN_DEVICE_MEMORY_GB) return 'static';
  return '3d';
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // Release the test context straight away; browsers limit how many can exist.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

interface NavigatorExtras {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

export function readHeroEnvironment(reducedMotion: boolean): HeroEnvironment {
  const nav = navigator as Navigator & NavigatorExtras;
  return {
    reducedMotion,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    // Checked last and only if needed: creating a WebGL context costs a little.
    webgl: reducedMotion ? false : hasWebGL(),
  };
}
