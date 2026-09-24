// The "alerts finding the right person" network used by the landing hero.
// Both the 3D scene and the static SVG fallback draw this same layout, so they look alike.
// A fixed random seed makes it identical on every visit.

export interface NetworkNode {
  x: number;
  y: number;
  z: number;
}

export interface Network {
  nodes: NetworkNode[];
  edges: [number, number][];
  /** The node alerts start from (KaziForce). */
  hub: number;
  /** People who receive alerts in the animation. */
  targets: number[];
}

/** Small deterministic random number generator (mulberry32). */
function seededRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const distance = (a: NetworkNode, b: NetworkNode) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function createNetwork(count = 34, seed = 7): Network {
  const random = seededRandom(seed);
  const nodes: NetworkNode[] = [{ x: 0, y: 0, z: 0 }];
  // Spread the others over a disc, keeping a minimum gap so nodes never overlap.
  while (nodes.length < count) {
    const angle = random() * Math.PI * 2;
    const radius = 0.25 + Math.sqrt(random()) * 0.75;
    const node = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.8,
      z: (random() - 0.5) * 0.5,
    };
    if (nodes.every((other) => distance(node, other) > 0.17)) nodes.push(node);
  }

  // Minimum spanning tree (Prim) keeps every node connected with short links...
  const edges: [number, number][] = [];
  const inTree = new Set([0]);
  while (inTree.size < nodes.length) {
    let best: [number, number] | null = null;
    let bestDistance = Infinity;
    for (const i of inTree) {
      nodes.forEach((node, j) => {
        if (inTree.has(j)) return;
        const d = distance(nodes[i]!, node);
        if (d < bestDistance) {
          bestDistance = d;
          best = [i, j];
        }
      });
    }
    const [from, to] = best!;
    edges.push([from, to]);
    inTree.add(to);
  }
  // ...plus a few extra short links so it looks like a network, not a tree.
  nodes.forEach((node, i) => {
    const nearest = nodes
      .map((other, j) => ({ j, d: distance(node, other) }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d)[1];
    if (
      nearest &&
      !edges.some(([a, b]) => (a === i && b === nearest.j) || (a === nearest.j && b === i))
    ) {
      edges.push([i, nearest.j]);
    }
  });

  // Targets: the five nodes furthest from the hub in different directions.
  const targets = nodes
    .map((node, i) => ({ i, angle: Math.atan2(node.y, node.x), d: Math.hypot(node.x, node.y) }))
    .filter(({ d }) => d > 0.6)
    .sort((a, b) => a.angle - b.angle)
    .filter((_, index, all) => index % Math.max(1, Math.floor(all.length / 5)) === 0)
    .slice(0, 5)
    .map(({ i }) => i);

  return { nodes, edges, hub: 0, targets };
}

/** Node indexes along the links from `from` to `to` (breadth-first search). */
export function findPath(network: Network, from: number, to: number): number[] {
  const neighbours = new Map<number, number[]>();
  for (const [a, b] of network.edges) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }
  const previous = new Map<number, number>([[from, from]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) break;
    for (const next of neighbours.get(current) ?? []) {
      if (!previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const step = previous.get(path[0]!);
    if (step === undefined) return [from, to];
    path.unshift(step);
  }
  return path;
}
