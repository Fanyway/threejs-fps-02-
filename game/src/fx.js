// Transient effects, all pooled: nothing is allocated in the hot loop.
// Tracers (reused lines), impact sparks (reused tetrahedra), smoke clouds
// (reused translucent spheres) and the flashbang white-out. Smoke volumes are
// also the data bots and the player ray use to decide whether sight is blocked.
import * as THREE from 'three';

const TRACER_POOL = 24;
const TRACER_LIFE = 0.09;
const SPARK_POOL = 16;
const SPARK_LIFE = 0.25;
const SMOKE_POOL = 10;

export function createFx(scene) {
  // Tracers: preallocated lines, two points each, cycled oldest-first.
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  // Impact sparks: small tetrahedra that pop and shrink.
  const sparks = [];
  const sparkGeo = new THREE.TetrahedronGeometry(0.07);
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(sparkGeo, material);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }
  let sparkNext = 0;

  // Smoke clouds: growing translucent spheres; their volumes block sight.
  const smokes = [];
  const smokeGeo = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < SMOKE_POOL; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: 0x9aa0a4, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(smokeGeo, material);
    mesh.visible = false;
    scene.add(mesh);
    smokes.push({ mesh, life: 0, duration: 1, radius: 3, center: new THREE.Vector3() });
  }
  let smokeNext = 0;

  return {
    spawnTracer(from, to, color = '#ffd27a') {
      const slot = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_POOL;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.material.color.set(color);
      slot.line.visible = true;
      slot.life = TRACER_LIFE;
    },
    spawnSpark(point) {
      const slot = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARK_POOL;
      slot.mesh.position.copy(point);
      slot.mesh.visible = true;
      slot.life = SPARK_LIFE;
    },
    spawnSmoke(center, radius, duration) {
      const slot = smokes[smokeNext];
      smokeNext = (smokeNext + 1) % SMOKE_POOL;
      slot.center.copy(center);
      slot.radius = radius;
      slot.duration = duration;
      slot.life = duration;
      slot.mesh.position.copy(center);
      slot.mesh.visible = true;
    },
    /** True when the segment between two points crosses a live smoke cloud. */
    blockedBySmoke(from, to) {
      for (const s of smokes) {
        if (s.life <= 0) continue;
        // Distance from the smoke centre to the segment.
        const ax = to.x - from.x;
        const ay = to.y - from.y;
        const az = to.z - from.z;
        const len2 = ax * ax + ay * ay + az * az;
        let t = 0;
        if (len2 > 0) {
          t = ((s.center.x - from.x) * ax + (s.center.y - from.y) * ay + (s.center.z - from.z) * az) / len2;
          t = Math.max(0, Math.min(1, t));
        }
        const dx = from.x + ax * t - s.center.x;
        const dy = from.y + ay * t - s.center.y;
        const dz = from.z + az * t - s.center.z;
        if (dx * dx + dy * dy + dz * dz < s.radius * s.radius * 0.8) return true;
      }
      return false;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / TRACER_LIFE) * 0.9;
        if (slot.life <= 0) slot.line.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        const k = Math.max(0, slot.life / SPARK_LIFE);
        slot.mesh.material.opacity = k;
        slot.mesh.scale.setScalar(0.5 + (1 - k) * 1.6);
        slot.mesh.rotation.y += dt * 9;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      for (const slot of smokes) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        const age = 1 - slot.life / slot.duration;
        const scale = slot.radius * (0.6 + age * 0.7);
        slot.mesh.scale.setScalar(scale);
        slot.mesh.material.opacity = Math.max(0, Math.min(0.55, slot.life / 3));
        if (slot.life <= 0) slot.mesh.visible = false;
      }
    },
    clear() {
      for (const slot of tracers) {
        slot.life = 0;
        slot.line.visible = false;
      }
      for (const slot of sparks) {
        slot.life = 0;
        slot.mesh.visible = false;
      }
      for (const slot of smokes) {
        slot.life = 0;
        slot.mesh.visible = false;
      }
    },
  };
}
