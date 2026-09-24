// The ONE Three.js scene in the project (landing page hero only; never in the logged-in app).
// "Alerts finding the right person": small lights travel along the network from KaziForce
// (centre) to one person at a time, who lights up when the alert arrives.
//
// Loaded on demand after the page has painted (see Hero.tsx), so it never slows the first view.
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createNetwork, findPath } from './heroNetwork';

export interface HeroColors {
  node: string;
  line: string;
  hub: string;
  pulse: string;
  target: string;
}

const MAX_PIXEL_RATIO = 1.5; // sharp enough, far cheaper than 3x on phones
const PULSE_SPEED = 0.9; // scene units per second: calm, not frantic
const PULSE_EVERY_S = 1.8;
const MAX_PULSES = 3;
const GLOW_S = 1.2;
const ROTATION_SPEED = 0.07; // radians per second

interface Pulse {
  mesh: Mesh;
  points: Vector3[];
  segment: number;
  progress: number;
  target: number;
}

/** Builds the scene inside `container`. Returns a cleanup function. */
export function mountHeroScene(container: HTMLElement, colors: HeroColors): () => void {
  const network = createNetwork();
  // SVG's y axis points down, WebGL's points up: flip so both versions look the same.
  const positions = network.nodes.map((n) => new Vector3(n.x, -n.y, n.z));

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 10);
  camera.position.set(0, 0, 3.3);

  const world = new Group();
  world.rotation.x = -0.25;
  scene.add(world);

  // Links between people.
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      network.edges.flatMap(([a, b]) => [...positions[a]!.toArray(), ...positions[b]!.toArray()]),
      3,
    ),
  );
  const lineMaterial = new LineBasicMaterial({
    color: colors.line,
    transparent: true,
    opacity: 0.45,
  });
  world.add(new LineSegments(lineGeometry, lineMaterial));

  // People (one instanced mesh = one draw call for all nodes).
  const nodeGeometry = new SphereGeometry(0.028, 16, 12);
  const nodeMaterial = new MeshBasicMaterial();
  const nodes = new InstancedMesh(nodeGeometry, nodeMaterial, positions.length);
  const baseColor = new Color(colors.node);
  const targetColor = new Color(colors.target);
  const matrix = new Matrix4();
  const glowUntil = new Map<number, number>();

  function placeNode(i: number, scale: number, color: Color) {
    matrix.makeScale(scale, scale, scale).setPosition(positions[i]!);
    nodes.setMatrixAt(i, matrix);
    nodes.setColorAt(i, color);
  }
  positions.forEach((_, i) =>
    placeNode(
      i,
      i === network.hub ? 2.2 : 1,
      i === network.hub ? new Color(colors.hub) : baseColor,
    ),
  );
  world.add(nodes);

  // Travelling alerts.
  const pulseGeometry = new SphereGeometry(0.04, 16, 12);
  const pulseMaterial = new MeshBasicMaterial({ color: colors.pulse });
  const pulses: Pulse[] = [];
  let nextTarget = 0;
  let sinceLastPulse = PULSE_EVERY_S;

  function launchPulse() {
    const target = network.targets[nextTarget % network.targets.length]!;
    nextTarget += 1;
    const mesh = new Mesh(pulseGeometry, pulseMaterial);
    const points = findPath(network, network.hub, target).map((i) => positions[i]!);
    mesh.position.copy(points[0]!);
    world.add(mesh);
    pulses.push({ mesh, points, segment: 0, progress: 0, target });
  }

  function update(delta: number, time: number) {
    world.rotation.y += ROTATION_SPEED * delta;

    sinceLastPulse += delta;
    if (sinceLastPulse >= PULSE_EVERY_S && pulses.length < MAX_PULSES) {
      sinceLastPulse = 0;
      launchPulse();
    }

    for (let p = pulses.length - 1; p >= 0; p--) {
      const pulse = pulses[p]!;
      const from = pulse.points[pulse.segment]!;
      const to = pulse.points[pulse.segment + 1];
      if (!to) {
        // Arrived: the person lights up, then the alert disappears.
        glowUntil.set(pulse.target, time + GLOW_S);
        world.remove(pulse.mesh);
        pulses.splice(p, 1);
        continue;
      }
      pulse.progress += (PULSE_SPEED * delta) / Math.max(from.distanceTo(to), 0.001);
      if (pulse.progress >= 1) {
        pulse.segment += 1;
        pulse.progress = 0;
      } else {
        pulse.mesh.position.lerpVectors(from, to, pulse.progress);
      }
    }

    for (const [i, until] of glowUntil) {
      const left = until - time;
      if (left <= 0) {
        placeNode(i, 1, baseColor);
        glowUntil.delete(i);
      } else {
        // Grow then settle (ease-out), no flashing.
        const t = 1 - left / GLOW_S;
        placeNode(i, 1 + 1.1 * Math.sin(Math.PI * t), targetColor);
      }
    }
    nodes.instanceMatrix.needsUpdate = true;
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // Only animate while visible on screen AND the tab is in front (saves battery and data).
  let onScreen = true;
  let last = performance.now();
  function tick(now: number) {
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    update(delta, now / 1000);
    renderer.render(scene, camera);
  }
  function syncLoop() {
    const run = onScreen && document.visibilityState === 'visible';
    if (run) last = performance.now();
    renderer.setAnimationLoop(run ? tick : null);
  }
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? false;
    syncLoop();
  });
  intersection.observe(container);
  document.addEventListener('visibilitychange', syncLoop);
  syncLoop();

  return () => {
    renderer.setAnimationLoop(null);
    intersection.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', syncLoop);
    for (const pulse of pulses) world.remove(pulse.mesh);
    lineGeometry.dispose();
    lineMaterial.dispose();
    nodeGeometry.dispose();
    nodeMaterial.dispose();
    nodes.dispose();
    pulseGeometry.dispose();
    pulseMaterial.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
