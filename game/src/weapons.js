// Weapons: four hitscan guns with different feel, and three grenades.
// main.js owns the ray and the damage; this module owns the numbers, the view
// model, the magazine and the reload. Spread grows with movement speed and with
// sustained fire, so stopping to aim pays — the core of the gunplay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'Kestrel P9', cost: 0, mag: 12, reserve: 36, damage: 34, headDamage: 102, gap: 0.16, reload: 1.1, spreadStill: 0.003, spreadMove: 0.02, auto: false },
  smg: { name: 'Hornet-9', cost: 1500, mag: 28, reserve: 112, damage: 22, headDamage: 66, gap: 0.075, reload: 1.6, spreadStill: 0.006, spreadMove: 0.034, auto: true },
  rifle: { name: 'Marauder AR', cost: 2700, mag: 30, reserve: 90, damage: 34, headDamage: 102, gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true },
  sniper: { name: 'Harpoon .50', cost: 4750, mag: 5, reserve: 15, damage: 95, headDamage: 250, gap: 1.1, reload: 2.6, spreadStill: 0.0004, spreadMove: 0.05, auto: false },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];

export const GRENADES = {
  he: { name: 'Popper HE', cost: 300, radius: 6, damage: 95 },
  smoke: { name: 'Haze Smoke', cost: 300, radius: 3.5, duration: 14 },
  flash: { name: 'Flare Flash', cost: 200, radius: 25 },
};
export const GRENADE_ORDER = ['he', 'smoke', 'flash'];

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.55, metalness: 0.2 });

  const models = {};
  function part(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  }
  function buildModel(kind) {
    const model = new THREE.Group();
    if (kind === 'pistol') {
      model.add(part(0.06, 0.07, 0.24, body, 0, 0, 0));
      model.add(part(0.055, 0.15, 0.08, grip, 0, -0.09, 0.08));
      model.add(part(0.02, 0.03, 0.05, accent, 0, 0.045, -0.08));
    } else if (kind === 'smg') {
      model.add(part(0.08, 0.09, 0.32, body, 0, 0, 0));
      model.add(part(0.04, 0.04, 0.24, grip, 0, 0.02, -0.26));
      model.add(part(0.05, 0.15, 0.07, dark, 0, -0.1, 0));
      model.add(part(0.09, 0.03, 0.1, accent, 0, 0.06, -0.1));
    } else if (kind === 'sniper') {
      model.add(part(0.08, 0.1, 0.46, dark, 0, 0, 0));
      model.add(part(0.04, 0.04, 0.5, grip, 0, 0.03, -0.46));
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), body);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.02);
      model.add(scope);
      model.add(part(0.07, 0.09, 0.22, grip, 0, -0.02, 0.3));
    } else {
      model.add(part(0.09, 0.1, 0.4, body, 0, 0, 0));
      model.add(part(0.045, 0.045, 0.36, grip, 0, 0.025, -0.36));
      model.add(part(0.075, 0.08, 0.2, grip, 0, -0.02, 0.28));
      model.add(part(0.03, 0.06, 0.07, dark, 0, 0.08, -0.08));
      model.add(part(0.09, 0.02, 0.12, accent, 0, 0.055, 0.05));
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }
  for (const kind of WEAPON_ORDER) models[kind] = buildModel(kind);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  const grenades = { he: 0, smoke: 0, flash: 0 };
  let current = 'pistol';
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0 };

  function currentDef() {
    return WEAPONS[current];
  }
  function showModel() {
    for (const kind of WEAPON_ORDER) models[kind].visible = kind === current;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    const model = models[current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (currentDef().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const def = currentDef();
        const slot = owned[current];
        const take = Math.min(def.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    get current() {
      return current;
    },
    get def() {
      return currentDef();
    },
    state: {
      get mag() {
        return owned[current].mag;
      },
      get reserve() {
        return owned[current].reserve;
      },
      get cooldown() {
        return state.cooldown;
      },
      get reloadLeft() {
        return state.reloadLeft;
      },
      get bloom() {
        return state.bloom;
      },
    },
    grenades,
    step,
    ready() {
      return owned[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = 0.06;
      state.kick = current === 'sniper' ? 0.11 : 0.055;
      state.bloom = Math.min(0.05, state.bloom + (current === 'sniper' ? 0 : 0.006));
    },
    takeRound() {
      if (owned[current].mag <= 0) return false;
      owned[current].mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const slot = owned[current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove + state.bloom;
    },
    switchTo(kind) {
      if (!owned[kind] || kind === current) return false;
      current = kind;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.15);
      showModel();
      return true;
    },
    buy(kind) {
      if (owned[kind]) return false;
      owned[kind] = { mag: WEAPONS[kind].mag, reserve: WEAPONS[kind].reserve };
      return true;
    },
    owns(kind) {
      return Boolean(owned[kind]);
    },
    buyGrenade(kind) {
      grenades[kind] += 1;
      return true;
    },
    useGrenade(kind) {
      if (grenades[kind] <= 0) return false;
      grenades[kind] -= 1;
      return true;
    },
    onDeath() {
      for (const kind of Object.keys(owned)) {
        if (kind !== 'pistol') delete owned[kind];
      }
      current = 'pistol';
      owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      grenades.he = 0;
      grenades.smoke = 0;
      grenades.flash = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      showModel();
    },
    refill() {
      for (const kind of Object.keys(owned)) {
        owned[kind] = { mag: WEAPONS[kind].mag, reserve: WEAPONS[kind].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    muzzleWorld(out) {
      return out.set(0.24, -0.18, -0.95).applyMatrix4(camera.matrixWorld);
    },
  };
}
