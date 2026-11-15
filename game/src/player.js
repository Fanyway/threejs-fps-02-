// The player body: acceleration-based movement with crouching and jumping,
// axis-separated collision against the world's AABBs, and health + armor.
// One state object, one step per fixed tick, no allocations in the hot path.
const RADIUS = 0.34;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const JUMP_SPEED = 5.4;
const GRAVITY = 14;

export function createPlayer(colliders) {
  const state = {
    position: { x: 0, y: 0, z: 17 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: Math.PI,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    onGround: true,
    health: 100,
    armor: 0,
    alive: true,
  };

  function overlaps(x, z, y) {
    const minY = y;
    const maxY = y + (state.crouched ? 1.25 : 1.78);
    for (const c of colliders) {
      if (x + RADIUS > c.min.x && x - RADIUS < c.max.x && z + RADIUS > c.min.z && z - RADIUS < c.max.z && maxY > c.min.y && minY < c.max.y) {
        return true;
      }
    }
    return false;
  }

  function moveAxis(dx, dz) {
    const p = state.position;
    if (dx !== 0 && !overlaps(p.x + dx, p.z, p.y)) p.x += dx;
    if (dz !== 0 && !overlaps(p.x, p.z + dz, p.y)) p.z += dz;
    // Stay inside the map bounds.
    p.x = Math.max(-25.4, Math.min(25.4, p.x));
    p.z = Math.max(-19.4, Math.min(19.4, p.z));
  }

  return {
    state,
    reset(x, z, yaw) {
      state.position.x = x;
      state.position.y = 0;
      state.position.z = z;
      state.velocity.x = 0;
      state.velocity.y = 0;
      state.velocity.z = 0;
      state.yaw = yaw;
      state.pitch = 0;
      state.eye = EYE_STAND;
      state.crouched = false;
      state.onGround = true;
      state.health = 100;
      state.armor = 0;
      state.alive = true;
    },
    look(dx, dy) {
      state.yaw -= dx * 0.0021;
      state.pitch -= dy * 0.0021;
      const limit = Math.PI / 2 - 0.01;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    },
    recoil(pitchKick, yawKick) {
      state.pitch += pitchKick;
      state.yaw += yawKick;
      const limit = Math.PI / 2 - 0.01;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    /** Damage after armor: armor absorbs half, up to what it holds. */
    damage(amount) {
      if (!state.alive) return false;
      let rest = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, rest * 0.5);
        state.armor -= absorbed;
        rest -= absorbed;
      }
      state.health -= rest;
      if (state.health <= 0) {
        state.health = 0;
        state.alive = false;
        return true;
      }
      return false;
    },
    step(dt, keys) {
      const p = state.position;
      const v = state.velocity;
      state.crouched = keys.has('ControlLeft') || keys.has('ControlRight');
      const targetEye = state.crouched ? EYE_CROUCH : EYE_STAND;
      state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const speed = state.crouched ? CROUCH_SPEED : WALK_SPEED;
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      // Forward is -z rotated by yaw; strafe is +x rotated by yaw.
      let wishX = -sin * forward + cos * strafe;
      let wishZ = -cos * forward - sin * strafe;
      const wishLen = Math.hypot(wishX, wishZ);
      if (wishLen > 0) {
        wishX = (wishX / wishLen) * speed;
        wishZ = (wishZ / wishLen) * speed;
      }
      // Exponential approach to the wish velocity: snappy accel, firm friction.
      const rate = wishLen > 0 ? 11 : 13;
      v.x += (wishX - v.x) * Math.min(1, rate * dt);
      v.z += (wishZ - v.z) * Math.min(1, rate * dt);

      if (keys.has('Space') && state.onGround) {
        v.y = JUMP_SPEED;
        state.onGround = false;
      }
      v.y -= GRAVITY * dt;
      moveAxis(v.x * dt, v.z * dt);
      p.y += v.y * dt;
      if (p.y <= 0) {
        p.y = 0;
        v.y = 0;
        state.onGround = true;
      }
    },
  };
}
