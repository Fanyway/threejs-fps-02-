// SALTWORKS: the map. A decommissioned saltworks on a tidal flat — a crusher hall
// (site A) in the west, a silo yard (site B) in the east, a plank causeway down the
// middle, evaporation ponds south of mid. Three lanes (west, mid, east), two sites,
// one original layout. Everything is flat (y = 0) with AABB colliders, so movement,
// bullets and bot paths all share one collision model.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUNDS = { minX: -26, maxX: 26, minZ: -20, maxZ: 20 };

// Waypoint graph the bots walk. Nodes are named places; edges are walkable links.
export const WAYPOINTS = {
  atkSpawn: [0, 17], atkWest: [-13, 13], atkEast: [13, 13], atkMid: [0, 12],
  pondWest: [-9, 6], pondEast: [9, 6],
  westLane: [-14, 4], eastLane: [14, 4],
  mid: [0, 0], midArch: [0, -2],
  westMid: [-13, -5], eastMid: [13, -5],
  aDoor: [-16, -8], aSite: [-20, -8], aHall: [-22, -10],
  bEntry: [16, -8], bSite: [20, -8],
  defWest: [-11, -14], defEast: [11, -14], defMid: [0, -12], defSpawn: [0, -17],
};
const EDGES = [
  ['atkSpawn', 'atkWest'], ['atkSpawn', 'atkMid'], ['atkSpawn', 'atkEast'],
  ['atkWest', 'pondWest'], ['atkWest', 'westLane'],
  ['atkEast', 'pondEast'], ['atkEast', 'eastLane'],
  ['atkMid', 'pondWest'], ['atkMid', 'mid'], ['atkMid', 'pondEast'],
  ['pondWest', 'westLane'], ['pondEast', 'eastLane'],
  ['westLane', 'westMid'], ['eastLane', 'eastMid'],
  ['mid', 'westMid'], ['mid', 'midArch'], ['mid', 'eastMid'],
  ['midArch', 'defMid'],
  ['westMid', 'aDoor'], ['westMid', 'defWest'],
  ['aDoor', 'aSite'], ['aDoor', 'aHall'], ['aSite', 'aHall'],
  ['eastMid', 'bEntry'], ['eastMid', 'defEast'],
  ['bEntry', 'bSite'], ['bSite', 'defEast'],
  ['defWest', 'defMid'], ['defEast', 'defMid'], ['defMid', 'defSpawn'],
];
const ADJACENT = {};
for (const [a, b] of EDGES) {
  (ADJACENT[a] ??= []).push(b);
  (ADJACENT[b] ??= []).push(a);
}

/** Breadth-first path over the waypoint graph; returns node ids, start included. */
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of ADJACENT[node] ?? []) {
      if (next in prev) continue;
      prev[next] = node;
      if (next === toId) {
        const path = [toId];
        let at = toId;
        while (prev[at] !== null) {
          at = prev[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [fromId];
}

/** Nearest waypoint id to a ground point. */
export function nearestWaypoint(x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, [wx, wz]] of Object.entries(WAYPOINTS)) {
    const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

export function createWorld(scene) {
  const materials = new Map();
  function mat(color, roughness = 0.92, metalness = 0.04) {
    const key = `${color}|${roughness}|${metalness}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
      materials.set(key, m);
    }
    return m;
  }

  const colliders = [];
  const shootables = [];

  function box(x, z, w, d, h, y0, color, collide = true, shootable = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, y0, z - d / 2), new THREE.Vector3(x + w / 2, y0 + h, z + d / 2)));
    if (shootable) shootables.push(mesh);
    return mesh;
  }
  function cylinder(x, z, r, h, color, collide = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, 0.55, 0.35));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, h, z + r)));
    shootables.push(mesh);
    return mesh;
  }
  function cone(x, z, r, h, color) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), mat(color));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r * 0.7, 0, z - r * 0.7), new THREE.Vector3(x + r * 0.7, h * 0.7, z + r * 0.7)));
    shootables.push(mesh);
    return mesh;
  }

  // Lighting: low warm sun from the south-east, cool sky fill, dusk fog.
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.4);
  sun.position.set(28, 34, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 110;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(new THREE.Color('#cfd8e8'), new THREE.Color('#4a3823'), 0.85));

  // Ground: sand, with salt-white patches, two ponds and the plank causeway.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(52, 40), mat(PALETTE.sand, 1, 0));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  for (const [x, z, w, d] of [[-9, 6.5, 8, 5], [9, 6.5, 8, 5]]) {
    const pond = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.pond), roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.9 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(x, 0.03, z);
    pond.receiveShadow = true;
    scene.add(pond);
  }
  const causeway = new THREE.Mesh(new THREE.PlaneGeometry(5, 26), mat(PALETTE.plank, 0.95, 0));
  causeway.rotation.x = -Math.PI / 2;
  causeway.position.set(0, 0.02, 1);
  causeway.receiveShadow = true;
  scene.add(causeway);
  for (const [x, z, r] of [[-6, 15, 3], [7, -15, 2.5], [-19, 2, 2.5], [18, 14, 3]]) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat(PALETTE.salt, 1, 0));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.02, z);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  // Perimeter walls.
  box(0, -20.5, 54, 1, 3.2, 0, PALETTE.concrete);
  box(0, 20.5, 54, 1, 3.2, 0, PALETTE.concrete);
  box(-26.5, 0, 1, 42, 3.2, 0, PALETTE.concrete);
  box(26.5, 0, 1, 42, 3.2, 0, PALETTE.concrete);

  // Site A — Crusher Hall (west): a room with a south door and an east door.
  // South wall (z=-3.5) with a 2.4 m door at x -19..-16.6; east wall (x=-15.5) with a door at z -9..-6.6.
  box(-22.5, -3.5, 6, 1, 3, 0, PALETTE.concrete);
  box(-17.8, -3.5, 3.4, 1, 3, 0, PALETTE.concrete);
  box(-24.5, -8, 1, 10, 3, 0, PALETTE.concrete);
  box(-15.5, -10.8, 1, 4.4, 3, 0, PALETTE.concrete);
  box(-15.5, -5.3, 1, 2.6, 3, 0, PALETTE.concrete);
  box(-20, -12.5, 10, 1, 3, 0, PALETTE.concrete);
  // The crusher itself: a big rusted machine inside the hall.
  box(-21.5, -10.5, 3, 2, 2.4, 0, PALETTE.rust);
  cylinder(-21.5, -10.5, 0.9, 3.2, PALETTE.metal);
  box(-17, -11, 1.6, 1.6, 1.4, 0, PALETTE.crate);
  box(-22.5, -5.2, 1.6, 1.6, 1.4, 0, PALETTE.crateDark);

  // Site B — Silo Yard (east): three silos and crates in the open.
  cylinder(18, -11, 1.7, 5.5, PALETTE.silo);
  cylinder(22, -9, 1.7, 5.5, PALETTE.silo);
  cylinder(19, -5, 1.7, 5.5, PALETTE.silo);
  box(16.8, -6.2, 1.6, 1.6, 1.4, 0, PALETTE.crate);
  box(23, -5.2, 1.6, 1.6, 1.4, 0, PALETTE.crateDark);

  // Cover crates along the lanes and mid.
  const crates = [
    [-14, 10, 1.6], [-15, 2, 1.6], [-13, -3, 2.2], [-10, -10, 1.6],
    [14, 10, 1.6], [15, 2, 1.6], [13, -3, 2.2], [10, -10, 1.6],
    [-4, 4, 1.4], [4, -4, 1.4], [-3, -8, 1.4], [3, 8, 1.4],
    [-6, -14, 1.4], [6, -14, 1.4], [-6, 13, 1.4], [6, 13, 1.4],
  ];
  for (const [x, z, h] of crates) box(x, z, 1.6, 1.6, h, 0, h > 2 ? PALETTE.crateDark : PALETTE.crate);

  // Salt mounds: white cones that read as cover at a glance.
  for (const [x, z] of [[-8, 12], [8, 12], [-8, -12], [8, -12]]) cone(x, z, 2, 1.7, PALETTE.mound);

  // The conveyor arch over mid: two rusted posts and a beam, a landmark for callouts.
  box(-2.6, -2, 0.5, 0.5, 3, 0, PALETTE.rust);
  box(2.6, -2, 0.5, 0.5, 3, 0, PALETTE.rust);
  box(0, -2, 5.7, 0.5, 0.5, 2.6, PALETTE.metal, false, true);

  // Site markers: a coloured ring on the ground, a pole and a letter flag.
  function siteMarker(letter, cx, cz, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.1, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.05, cz);
    scene.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8), mat(PALETTE.metal, 0.5, 0.5));
    pole.position.set(cx + 3.6, 2.2, cz);
    pole.castShadow = true;
    scene.add(pole);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#191009';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }),
    );
    flag.position.set(cx + 3.6, 3.9, cz);
    scene.add(flag);
  }
  siteMarker('A', -20, -8, PALETTE.siteA);
  siteMarker('B', 20, -8, PALETTE.siteB);

  const sites = {
    A: { center: { x: -20, z: -8 }, radius: 4.5 },
    B: { center: { x: 20, z: -8 }, radius: 4.5 },
  };
  const spawns = {
    atk: [[0, 17], [-4, 17], [-2, 17.6], [2, 17.6], [4, 17]],
    def: [[0, -17], [-4, -17], [-2, -17.6], [2, -17.6], [4, -17]],
  };

  return {
    colliders,
    shootables,
    sites,
    spawns,
    bounds: BOUNDS,
    inSite(x, z, site) {
      const s = sites[site];
      const dx = x - s.center.x;
      const dz = z - s.center.z;
      return dx * dx + dz * dz <= s.radius * s.radius;
    },
  };
}
