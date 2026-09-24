import { useMemo } from 'react';
import { createNetwork, findPath } from './heroNetwork';

/**
 * Still version of the hero: the same network, with one alert's route highlighted from
 * KaziForce (centre) to one person. Used as the fallback and while the 3D scene loads.
 */
export function HeroStatic() {
  const { network, route, target } = useMemo(() => {
    const network = createNetwork();
    const target = network.targets[1] ?? network.targets[0] ?? 1;
    return { network, route: findPath(network, network.hub, target), target };
  }, []);
  const { nodes, edges, hub } = network;

  const point = (i: number) => nodes[i]!;
  const routePoints = route.map((i) => `${point(i).x},${point(i).y}`).join(' ');

  return (
    <svg viewBox="-1.15 -1 2.3 2" className="h-full w-full" aria-hidden="true" focusable="false">
      <g stroke="var(--kf-line-strong)" strokeWidth="0.006" opacity="0.55">
        {edges.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={point(a).x} y1={point(a).y} x2={point(b).x} y2={point(b).y} />
        ))}
      </g>
      <polyline
        points={routePoints}
        fill="none"
        stroke="var(--kf-primary)"
        strokeWidth="0.018"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {nodes.map((node, i) => (
        <circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={i === hub ? 0.06 : 0.026}
          fill={
            i === hub
              ? 'var(--kf-primary)'
              : network.targets.includes(i)
                ? 'var(--kf-important-bar)'
                : 'var(--kf-later-bar)'
          }
        />
      ))}
      {/* The person the alert reached: a ring around them. */}
      <circle
        cx={point(target).x}
        cy={point(target).y}
        r="0.075"
        fill="none"
        stroke="var(--kf-primary)"
        strokeWidth="0.014"
      />
      <circle cx={point(target).x} cy={point(target).y} r="0.035" fill="var(--kf-primary)" />
    </svg>
  );
}
