// SALTWORKS: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate; combat, grenades, the bomb and round events are wired here.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame, renders it
// twice, then freezes it and sets window.__shotReady for the screenshot harness.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, WEAPON_ORDER, GRENADES, GRENADE_ORDER } from './weapons.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 100000) + 1);

window.__errors = [];
window.addEventListener('error', (event) => window.__errors.push(String(event.message)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const fx = createFx(scene);
const weapon = createWeapon(camera);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const rounds = createRounds(random);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpVec3 = new THREE.Vector3();

// The bomb's world mesh: shown dropped or planted, hidden while carried.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.2, 0.5),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2d31'), roughness: 0.5, metalness: 0.5 }),
);
const bombLamp = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.06, 0.08),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.bomb) }),
);
bombLamp.position.set(0, 0.13, 0);
bombMesh.add(bombBody, bombLamp);
bombMesh.visible = false;
scene.add(bombMesh);
const bombLight = new THREE.PointLight(new THREE.Color(PALETTE.bomb), 0, 6);
scene.add(bombLight);

const noises = [];
let elapsed = 0;
let kills = 0;
let frozen = false;
let started = false;
let buyOpen = false;
let grenadeSelected = 'he';
let lastBeepSecond = -1;
let accumulator = 0;
let lastTime = performance.now();
let prevKeys = new Set();

const body = player.state;

function noise(x, z, radius) {
  noises.push({ x, z, radius, until: elapsed + 1.2 });
  if (noises.length > 24) noises.shift();
}

function losClear(from, to) {
  tmpVec.copy(to).sub(from);
  const dist = tmpVec.length();
  if (dist < 0.01) return true;
  tmpVec.normalize();
  raycaster.set(from, tmpVec);
  const hits = raycaster.intersectObjects(world.shootables, false);
  if (hits.length > 0 && hits[0].distance < dist - 0.6) return false;
  return !fx.blockedBySmoke(from, to);
}

function onPlayerDeath() {
  const bomb = rounds.state.bomb;
  if (bomb.state === 'carried' && bomb.carrier === 'player') {
    bomb.state = 'dropped';
    bomb.carrier = null;
    bomb.pos = { x: body.position.x, z: body.position.z };
    bombMesh.position.set(body.position.x, 0.12, body.position.z);
    bombMesh.visible = true;
  }
  weapon.onDeath();
  hud.showBanner('ELIMINATED', 'Your team fights on — the round continues.');
  input.releaseLock();
  audio.roundLose();
}

function onKill(victim, attacker, headshot) {
  if (attacker === 'player') {
    kills += 1;
    rounds.addKillReward();
    hud.killfeedAdd(`You ▸ ${victim.name}${headshot ? ' (headshot)' : ''}`, true);
    hud.setMoney(rounds.state.money);
    audio.kill();
  } else if (attacker && attacker.name) {
    hud.killfeedAdd(`${attacker.name} ▸ ${victim.name}`, attacker.team === 'atk');
  }
  // A dead carrier drops the bomb where he fell.
  const bomb = rounds.state.bomb;
  if (bomb.state === 'carried' && bomb.carrier === victim.id) {
    bomb.state = 'dropped';
    bomb.carrier = null;
    bomb.pos = { x: victim.group.position.x, z: victim.group.position.z };
    bombMesh.position.set(bomb.pos.x, 0.12, bomb.pos.z);
    bombMesh.visible = true;
    victim.role = 'rusher';
  }
}

const env = {
  playerAlive: () => player.state.alive,
  playerPos: () => player.state.position,
  phase: () => rounds.state.phase,
  damagePlayer(amount, from) {
    if (!player.state.alive) return;
    const killed = player.damage(amount);
    hud.setHealth(player.state.health, player.state.armor);
    if (killed) {
      onPlayerDeath();
    } else {
      audio.hurt();
      hud.damageFlash();
    }
  },
  onKill,
  onBombPickup(bot) {
    const bomb = rounds.state.bomb;
    bomb.state = 'carried';
    bomb.carrier = bot.id;
    bomb.pos = null;
    bot.role = 'carrier';
    bombMesh.visible = false;
  },
  tracers: fx,
  smokeBlocks: (from, to) => fx.blockedBySmoke(from, to),
  noise,
  hear(x, z, time) {
    for (const n of noises) {
      if (time > n.until) continue;
      if (Math.hypot(n.x - x, n.z - z) < n.radius) return n;
    }
    return null;
  },
};

const bots = createBots(scene, world, random, env);
const shootables = world.shootables.concat(bots.hitMeshes);

const grenades = createGrenades(world.colliders, {
  onExplode(pos, def) {
    audio.explosion();
    noise(pos.x, pos.z, 30);
    for (let i = 0; i < 5; i += 1) {
      tmpVec.set(pos.x + (random() - 0.5) * 0.8, pos.y + random() * 0.6, pos.z + (random() - 0.5) * 0.8);
      fx.spawnSpark(tmpVec);
    }
    const hurt = (px, py, pz) => {
      const d = Math.hypot(px - pos.x, py - pos.y, pz - pos.z);
      return d >= def.radius ? 0 : def.damage * (1 - d / def.radius);
    };
    if (player.state.alive) {
      const dmg = hurt(body.position.x, body.position.y + 1.2, body.position.z);
      if (dmg > 0) env.damagePlayer(dmg, pos);
    }
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      const dmg = hurt(bot.group.position.x, 1.2, bot.group.position.z);
      if (dmg > 0) bots.damage(bot.torso, dmg, 'player', false);
    }
  },
  onSmoke(pos, def) {
    audio.pop();
    fx.spawnSmoke(pos, def.radius, def.duration);
  },
  onFlash(pos, def) {
    audio.pop();
    camera.getWorldDirection(tmpVec);
    tmpVec2.set(pos.x - camera.position.x, pos.y - camera.position.y, pos.z - camera.position.z);
    const dist = tmpVec2.length();
    if (player.state.alive && dist < def.radius) {
      tmpVec2.normalize();
      const facing = tmpVec.dot(tmpVec2);
      const eye = tmpVec3.set(camera.position.x, camera.position.y, camera.position.z);
      if (facing > 0.1 && losClear(eye, pos)) {
        hud.flashbang((1 - dist / def.radius) * (0.4 + facing * 0.6));
      }
    }
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      const dx = pos.x - bot.group.position.x;
      const dz = pos.z - bot.group.position.z;
      if (Math.hypot(dx, dz) > def.radius) continue;
      tmpVec.set(bot.group.position.x, 1.5, bot.group.position.z);
      tmpVec2.set(pos.x, pos.y + 0.4, pos.z);
      if (!losClear(tmpVec, tmpVec2)) continue;
      const facing = Math.sin(bot.yaw) * -dx + Math.cos(bot.yaw) * -dz;
      if (facing > 0) {
        bot.target = null;
        bot.pauseTimer = 2.5;
        bot.reactionAt = elapsed + 2.5;
      }
    }
  },
});

hud.onPlay((kind) => {
  audio.unlock();
  if (kind === 'match') {
    rounds.startMatch();
    resetRound();
    hud.hideOverlay();
    hud.hideBanner();
  }
  if (shot) return;
  input.requestLock();
});

hud.onBuy((kind, key) => {
  if (rounds.state.phase !== 'buy') return;
  if (kind === 'weapon') {
    if (rounds.buyWeapon(key) && weapon.buy(key)) {
      weapon.switchTo(key);
      hud.setWeapon(weapon.def.name);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve);
      audio.buy();
    }
  } else if (kind === 'grenade') {
    if (rounds.buyGrenade(key) && weapon.buyGrenade(key)) audio.buy();
  } else if (kind === 'armor') {
    if (rounds.buyArmor()) {
      player.state.armor = 50;
      hud.setHealth(player.state.health, player.state.armor);
      audio.buy();
    }
  }
  hud.setMoney(rounds.state.money);
  hud.setGrenades(weapon.grenades);
  hud.refreshBuy(rounds.state.money, ownedWeaponKinds(), weapon.grenades, player.state.armor);
});

function ownedWeaponKinds() {
  return WEAPON_ORDER.filter((kind) => weapon.owns(kind));
}

function resetRound() {
  const spawn = world.spawns.atk[0];
  player.reset(spawn[0], spawn[1], 0);
  bots.reset(rounds.state.targetSite);
  weapon.refill();
  fx.clear();
  grenades.clear();
  bombMesh.visible = false;
  bombLight.intensity = 0;
  lastBeepSecond = -1;
  hud.setHealth(100, player.state.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.def.name);
  hud.setGrenades(weapon.grenades);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.scoreAtk, rounds.state.scoreDef, rounds.state.round);
  hud.setBomb('Bomb on you — take it to A or B, hold E to plant.');
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    weapon.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hits = raycaster.intersectObjects(shootables, false);
  const hit = hits[0];
  const muzzle = weapon.muzzleWorld(tmpVec2);
  const end = hit ? hit.point : tmpVec3.copy(camera.position).addScaledVector(direction, 80);
  fx.spawnTracer(muzzle.clone(), end.clone(), weapon.def.tracer ?? '#ffd27a');
  if (hit) {
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const headshot = hit.object.userData.part === 'head';
      const dmg = headshot ? weapon.def.headDamage : weapon.def.damage;
      const result = bots.damage(hit.object, dmg, 'player', headshot);
      hud.hitMarker(result.killed, shot ? 4000 : 90);
      if (result.killed) hud.setScore(rounds.state.scoreAtk, rounds.state.scoreDef, rounds.state.round);
      else audio.hit();
    } else {
      fx.spawnSpark(hit.point);
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  noise(body.position.x, body.position.z, 20);
  audio.shot(weapon.current);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function throwGrenade() {
  const kind = grenadeSelected;
  if (!weapon.useGrenade(kind)) return;
  camera.getWorldDirection(direction);
  tmpVec.set(camera.position.x, camera.position.y - 0.1, camera.position.z);
  grenades.throw(kind, tmpVec, direction);
  hud.setGrenades(weapon.grenades);
  audio.pop();
}

function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'phaseLive') {
      buyOpen = false;
      hud.hideBuy();
      hud.showBanner(`ROUND ${rounds.state.round}`, `Take the charge to site ${event.targetSite} — or hold them off.`);
      setTimeout(() => hud.hideBanner(), 2600);
    } else if (event.type === 'planted') {
      hud.showBanner('CHARGE PLANTED', `Site ${event.site} — hold it until it blows.`);
      setTimeout(() => hud.hideBanner(), 2600);
      audio.plantBeep();
    } else if (event.type === 'detonated') {
      const site = world.sites[event.site];
      fx.spawnSpark(tmpVec.set(site.center.x, 1.5, site.center.z));
      audio.explosion();
      hud.showBanner('SITE DESTROYED', 'The charge blew. Breakers take the round.');
    } else if (event.type === 'roundEnd') {
      const won = event.winner === 'atk';
      hud.showBanner(won ? 'BREAKERS WIN' : 'WARDENS WIN', `${event.reason} — ${event.scoreAtk} : ${event.scoreDef}`);
      if (won) audio.roundWin();
      else audio.roundLose();
    } else if (event.type === 'matchEnd') {
      const won = event.winner === 'atk';
      hud.showOverlay('match', {
        title: event.winner === 'draw' ? 'DRAW' : won ? 'BREAKERS TAKE THE MATCH' : 'WARDENS TAKE THE MATCH',
        copy: `Final score ${event.scoreAtk} : ${event.scoreDef}. ${kills} eliminations for you.`,
      });
      input.releaseLock();
    } else if (event.type === 'roundStart') {
      resetRound();
      hud.hideBanner();
    }
  }
}

function step(dt) {
  elapsed += dt;
  const keys = input.state.keys;

  // One-shot key presses (edge-triggered).
  const pressed = (code) => keys.has(code) && !prevKeys.has(code);
  if (pressed('KeyB') && rounds.state.phase === 'buy' && player.state.alive) {
    buyOpen = !buyOpen;
    if (buyOpen) {
      hud.showBuy(rounds.state.money, ownedWeaponKinds(), weapon.grenades, player.state.armor);
      input.releaseLock();
    } else {
      hud.hideBuy();
      input.requestLock();
    }
  }
  if (pressed('Digit1')) weapon.switchTo('pistol');
  if (pressed('Digit2')) weapon.switchTo('smg');
  if (pressed('Digit3')) weapon.switchTo('rifle');
  if (pressed('Digit4')) weapon.switchTo('sniper');
  if (pressed('Digit5')) grenadeSelected = 'he';
  if (pressed('Digit6')) grenadeSelected = 'smoke';
  if (pressed('Digit7')) grenadeSelected = 'flash';
  if (pressed('KeyG') && player.state.alive) throwGrenade();
  if (pressed('KeyR')) weapon.reload();

  if (player.state.alive) player.step(dt, keys);
  weapon.step(dt);
  fx.step(dt);
  grenades.step(dt);

  // Bomb planting / defusing info for the round state.
  const bomb = rounds.state.bomb;
  let playerInSite = null;
  if (player.state.alive) {
    if (world.inSite(body.position.x, body.position.z, 'A')) playerInSite = 'A';
    else if (world.inSite(body.position.x, body.position.z, 'B')) playerInSite = 'B';
  }
  const planting = playerInSite !== null && keys.has('KeyE') && bomb.state === 'carried' && bomb.carrier === 'player';
  const botReport = bots.step(dt, elapsed, bomb);
  const events = rounds.step(dt, {
    playerAlive: player.state.alive,
    playerInSite,
    interactHeld: keys.has('KeyE'),
    playerPlanted: planting,
    carrierBotPlanting: botReport.carrierPlanting,
    carrierBotSite: botReport.carrierSite,
    defuserPresent: botReport.defuserPresent,
    atkAlive: (player.state.alive ? 1 : 0) + bots.aliveCount('atk'),
    defAlive: bots.aliveCount('def'),
  });
  handleEvents(events);

  // Bomb visuals: dropped marker, planted blink + beep.
  if (bomb.state === 'dropped' && bomb.pos) {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.pos.x, 0.12, bomb.pos.z);
    bombLight.intensity = 0;
  } else if (bomb.state === 'planted') {
    const site = world.sites[bomb.site];
    bombMesh.visible = true;
    bombMesh.position.set(site.center.x, 0.12, site.center.z);
    bombLight.position.set(site.center.x, 1.5, site.center.z);
    bombLight.intensity = 2 + Math.sin(elapsed * 8) * 1.5;
    const second = Math.ceil(bomb.fuseLeft);
    if (second !== lastBeepSecond) {
      lastBeepSecond = second;
      audio.bombBeep();
    }
  } else {
    bombMesh.visible = false;
    bombLight.intensity = 0;
  }

  // HUD readouts.
  hud.setTimer(rounds.state.timer);
  hud.setScore(rounds.state.scoreAtk, rounds.state.scoreDef, rounds.state.round);
  hud.setWeapon(weapon.def.name);
  hud.setCrosshairGap(6 + weapon.spread(player.groundSpeed()) * 900 + weapon.state.bloom * 300);
  if (bomb.state === 'planted') {
    hud.setBomb(`CHARGE PLANTED at ${bomb.site} — ${Math.ceil(bomb.fuseLeft)}s to detonation`);
  } else if (bomb.state === 'carried' && bomb.carrier === 'player') {
    hud.setBomb(playerInSite ? 'Hold E to plant the charge' : 'Bomb on you — take it to A or B');
  } else if (bomb.state === 'carried') {
    hud.setBomb('A teammate carries the charge');
  } else if (bomb.state === 'dropped') {
    hud.setBomb('Charge dropped — pick it up');
  } else {
    hud.setBomb('');
  }
  hud.setInteract(planting ? `Planting… ${Math.round(bomb.plantProgress * 100)}%` : null);

  prevKeys = new Set(keys);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.state.alive) player.look(look.x, look.y);
    if (input.state.firing && weapon.ready() && player.state.alive) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  hud.hideBuy();
  resetRound();
  if (name === 'start') {
    body.position.x = 0.6;
    body.position.y = 0;
    body.position.z = 16.5;
    body.yaw = 0;
    body.pitch = 0.02;
    settle(30);
    hud.showOverlay('start', {});
  } else if (name === 'buy') {
    body.position.x = -2;
    body.position.y = 0;
    body.position.z = 15;
    body.yaw = 0.15;
    settle(10);
    hud.showBuy(rounds.state.money, ownedWeaponKinds(), weapon.grenades, player.state.armor);
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 60;
    body.position.x = 0;
    body.position.y = 0;
    body.position.z = 8;
    body.yaw = 0;
    body.pitch = 0;
    // March the bots to mid, then fight: aim at the nearest defender and fire.
    settle(60);
    const defs = bots.list.filter((b) => b.alive && b.team === 'def');
    const target = defs.length > 0 ? defs[0] : null;
    const aimDef = () => {
      if (!target || !target.alive) return new THREE.Vector3(0, 1.2, -8);
      return new THREE.Vector3(target.group.position.x, 1.2, target.group.position.z);
    };
    for (let round = 0; round < 3; round += 1) {
      aimAt(aimDef());
      shoot(0);
      if (round < 2) settle(8);
    }
    settle(10);
    aimAt(aimDef());
    shoot(0);
    settle(2);
  } else if (name === 'end') {
    rounds.state.phase = 'end';
    rounds.state.scoreAtk = 3;
    rounds.state.scoreDef = 2;
    rounds.state.timer = 3;
    body.position.x = -14;
    body.position.y = 0;
    body.position.z = -2;
    body.yaw = -0.6;
    settle(5);
    hud.showBanner('BREAKERS WIN', 'eliminated — 3 : 2');
  }
  hud.setScore(rounds.state.scoreAtk, rounds.state.scoreDef, rounds.state.round);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setMoney(rounds.state.money);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBanner();
  } else if (rounds.state.phase !== 'match' && !buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start', {});
  }
}

const input = createInput(renderer.domElement, onLockChange);

resetRound();
hud.showOverlay('start', {});
hud.setAmmo(weapon.state.mag, weapon.state.reserve);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
