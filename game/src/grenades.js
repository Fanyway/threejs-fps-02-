// Thrown grenades: a short arc under gravity, one ground bounce, then the fuse
// fires. The physics lives here; what an explosion does lives in main.js,
// which passes an `effects` object with onExplode/onSmoke/onFlash callbacks.
import * as THREE from 'three';
import { GRENADES } from './weapons.js';

const GRAVITY = 12;
const RADIUS = 0.12;

export function createGrenades(colliders, effects) {
  const active = [];

  function hitsWall(p) {
    for (const c of colliders) {
      if (p.x + RADIUS > c.min.x && p.x - RADIUS < c.max.x && p.y + RADIUS > c.min.y && p.y - RADIUS < c.max.y && p.z + RADIUS > c.min.z && p.z - RADIUS < c.max.z) {
        return c;
      }
    }
    return null;
  }

  return {
    get active() {
      return active;
    },
    /** Throw from a position along a direction (unit). Speed ~11 m/s, slight up-tilt. */
    throw(kind, from, dir) {
      const vel = new THREE.Vector3(dir.x, dir.y + 0.22, dir.z).normalize().multiplyScalar(11);
      active.push({
        kind,
        pos: new THREE.Vector3(from.x, from.y, from.z),
        vel,
        fuse: kind === 'flash' ? 1.1 : 1.5,
        bounced: false,
        mesh: null,
      });
    },
    step(dt) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const g = active[i];
        g.vel.y -= GRAVITY * dt;
        g.pos.addScaledVector(g.vel, dt);
        // Ground bounce, once, damped.
        if (g.pos.y < 0.12) {
          g.pos.y = 0.12;
          if (!g.bounced) {
            g.bounced = true;
            g.fuse = Math.min(g.fuse, 0.45);
          }
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        }
        const wall = hitsWall(g.pos);
        if (wall) {
          // Cheap reflect: damp the velocity and push out along the smallest axis.
          const cx = (wall.min.x + wall.max.x) / 2;
          const cz = (wall.min.z + wall.max.z) / 2;
          if (Math.abs(g.pos.x - cx) > Math.abs(g.pos.z - cz)) g.vel.x *= -0.4;
          else g.vel.z *= -0.4;
          g.pos.addScaledVector(g.vel, dt * 2);
        }
        g.fuse -= dt;
        if (g.fuse <= 0) {
          const def = GRENADES[g.kind];
          if (g.kind === 'he') effects.onExplode(g.pos.clone(), def);
          else if (g.kind === 'smoke') effects.onSmoke(g.pos.clone(), def);
          else effects.onFlash(g.pos.clone(), def);
          active.splice(i, 1);
        }
      }
    },
    clear() {
      active.length = 0;
    },
  };
}
