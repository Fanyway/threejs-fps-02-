// Bot agents: four attackers and five defenders with waypoint navigation,
// line-of-sight perception, burst fire, hearing, and bomb duties. Attackers
// push the called site, defenders hold ground and rotate on a plant. A bot
// that dies falls over and stays down until the next round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { findPath, nearestWaypoint, WAYPOINTS } from './world.js';

const BOT_NAMES_ATK = ['Arka', 'Bara', 'Nara', 'Tara'];
const BOT_NAMES_DEF = ['Vira', 'Kala', 'Mira', 'Jaka', 'Sari'];
const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.5;

function makeBody(team) {
  const group = new THREE.Group();
  const teamColor = team === 'atk' ? PALETTE.ally : PALETTE.enemy;
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a06b'), roughness: 0.8 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), darkMat);
  legL.position.set(-0.11, 0.39, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), darkMat);
  legR.position.set(0.11, 0.39, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.7, 0.3), torsoMat);
  torso.position.y = 1.13;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
  head.position.y = 1.64;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.11, 0.38), darkMat);
  helmet.position.y = 1.76;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.6), darkMat);
  gun.position.set(0.2, 1.24, -0.26);
  group.add(legL, legR, torso, head, helmet, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head, gun };
}

export function createBots(scene, world, random, env) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const probe = new THREE.Box3();
  const tmpDir = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function overlaps(x, z) {
    probe.min.set(x - RADIUS, 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, HEIGHT - 0.04, z + RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function losClear(from, to) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    const hits = raycaster.intersectObjects(world.shootables, false);
    if (hits.length > 0 && hits[0].distance < dist - 0.6) return false;
    return !env.smokeBlocks(from, to);
  }

  function spawnBot(team, index, x, z) {
    const name = team === 'atk' ? BOT_NAMES_ATK[index] : BOT_NAMES_DEF[index];
    const { group, torso, head, gun } = makeBody(team);
    group.position.set(x, 0, z);
    scene.add(group);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      group,
      torso,
      head,
      gun,
      health: 100,
      alive: true,
      yaw: team === 'atk' ? 0 : Math.PI,
      speed: 3.1 + random() * 1.0,
      role: 'rusher',
      path: [],
      pathIndex: 0,
      holdNode: null,
      scanPhase: random() * Math.PI * 2,
      target: null,
      reactionAt: 0,
      lastSeenAt: -10,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      perceiveTimer: random() * 0.2,
      strafeDir: random() > 0.5 ? 1 : -1,
      strafeTimer: 0,
      fall: 0,
      weapon: random() > 0.45 ? 'rifle' : 'smg',
      investigate: null,
      home: new THREE.Vector3(x, 0, z),
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    return bot;
  }

  const list = [];
  world.spawns.atk.forEach(([x, z], i) => {
    if (i === 0) return; // slot 0 is the player
    list.push(spawnBot('atk', i - 1, x, z));
  });
  world.spawns.def.forEach(([x, z], i) => {
    list.push(spawnBot('def', i, x, z));
  });

  const hitMeshes = [];
  for (const bot of list) hitMeshes.push(bot.torso, bot.head);

  function setPath(bot, toNode) {
    const from = nearestWaypoint(bot.group.position.x, bot.group.position.z);
    bot.path = findPath(from, toNode);
    bot.pathIndex = 0;
  }

  function moveToward(bot, x, z, dt) {
    const dx = x - bot.group.position.x;
    const dz = z - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, bot.speed * dt);
    const nx = bot.group.position.x + (dx / dist) * stepLen;
    const nz = bot.group.position.z + (dz / dist) * stepLen;
    let moved = false;
    if (!overlaps(nx, bot.group.position.z)) {
      bot.group.position.x = nx;
      moved = true;
    }
    if (!overlaps(bot.group.position.x, nz)) {
      bot.group.position.z = nz;
      moved = true;
    }
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-6 * dt, Math.min(6 * dt, diff));
    bot.group.rotation.y = bot.yaw;
    return moved && dist - stepLen < 0.05;
  }

  function followPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = WAYPOINTS[bot.path[bot.pathIndex]];
    // Per-bot jitter so a squad does not walk in a single file line. The digit
    // at the end of the id (char 4) varies per bot; the z jitter is derived from
    // the same digit so both stay in bounds.
    const digit = bot.id.charCodeAt(4) % 5;
    const jitterX = node[0] + (digit - 2) * 0.35;
    const jitterZ = node[1] + (((digit + 2) % 5) - 2) * 0.35;
    if (moveToward(bot, jitterX, jitterZ, dt)) bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }

  function eyePos(bot, out) {
    return out.set(bot.group.position.x, EYE, bot.group.position.z);
  }

  function chestOf(bot, out) {
    return out.set(bot.group.position.x, 1.2, bot.group.position.z);
  }

  function visibleEnemy(bot) {
    if (env.playerAlive()) {
      const playerPos = env.playerPos();
      const from = eyePos(bot, new THREE.Vector3());
      tmpTarget.set(playerPos.x, playerPos.y + 1.35, playerPos.z);
      const dist = from.distanceTo(tmpTarget);
      if (dist < 46 && losClear(from, tmpTarget)) {
        return { kind: 'player', dist, point: tmpTarget.clone() };
      }
    }
    let best = null;
    let bestDist = Infinity;
    for (const other of list) {
      if (!other.alive || other.team === bot.team) continue;
      const from = eyePos(bot, new THREE.Vector3());
      const to = chestOf(other, new THREE.Vector3());
      const dist = from.distanceTo(to);
      if (dist > 42 || dist >= bestDist) continue;
      if (!losClear(from, to)) continue;
      best = { kind: 'bot', ref: other, dist, point: to };
      bestDist = dist;
    }
    return best;
  }

  function fireAt(bot, target) {
    if (bot.burstLeft <= 0) {
      if (bot.pauseTimer > 0) return;
      bot.burstLeft = 3;
      bot.burstTimer = 0;
      bot.pauseTimer = 0.55 + random() * 0.3;
    }
    bot.burstTimer -= 1 / 60;
    if (bot.burstTimer > 0) return;
    bot.burstTimer = 0.13;
    bot.burstLeft -= 1;
    const from = eyePos(bot, new THREE.Vector3());
    from.y += 0.05;
    const muzzle = new THREE.Vector3(from.x, from.y, from.z);
    const miss = target.dist > 26 ? 0.5 : 0.32;
    const hitChance = target.kind === 'player' ? 0.42 : 0.5;
    const willHit = random() < hitChance;
    let end;
    if (target.kind === 'player') {
      const playerPos = env.playerPos();
      const aim = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);
      end = willHit ? aim : aim.clone().add(new THREE.Vector3((random() - 0.5) * miss * 2, (random() - 0.5) * miss, (random() - 0.5) * miss * 2));
      env.tracers.spawnTracer(muzzle, end, '#ffb37a');
      if (willHit) env.damagePlayer(bot.weapon === 'smg' ? 9 + random() * 5 : 11 + random() * 6, from);
    } else {
      const aim = chestOf(target.ref, new THREE.Vector3());
      end = willHit ? aim : aim.clone().add(new THREE.Vector3((random() - 0.5) * miss * 2, (random() - 0.5) * miss, (random() - 0.5) * miss * 2));
      env.tracers.spawnTracer(muzzle, end, '#ffb37a');
      if (willHit) {
        const dmg = bot.weapon === 'smg' ? 12 + random() * 8 : 15 + random() * 10;
        damage(target.ref.torso, dmg, bot, false);
      }
    }
    env.noise(from.x, from.z, 20);
  }

  function damage(mesh, amount, attacker, headshot) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return { killed: false };
    bot.health -= amount;
    if (bot.health > 0) return { killed: false };
    bot.alive = false;
    bot.fall = 0;
    bot.target = null;
    env.onKill(bot, attacker, headshot);
    return { killed: true };
  }

  function reset(targetSite) {
    for (const bot of list) {
      const idx = Number(bot.id.slice(4));
      const spawn = bot.team === 'atk' ? world.spawns.atk[idx + 1] : world.spawns.def[idx];
      bot.group.position.set(spawn[0], 0, spawn[1]);
      bot.group.rotation.set(0, bot.team === 'atk' ? 0 : Math.PI, 0);
      bot.yaw = bot.team === 'atk' ? 0 : Math.PI;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.pauseTimer = 0;
      bot.investigate = null;
      bot.weapon = random() > 0.45 ? 'rifle' : 'smg';
      if (bot.team === 'atk') {
        bot.role = 'rusher';
        if (bot.id === 'atk-3') {
          setPath(bot, 'mid');
          bot.role = 'flanker';
        } else {
          setPath(bot, targetSite === 'A' ? 'aSite' : 'bSite');
        }
      } else {
        const holds = ['aSite', 'bSite', 'westMid', 'eastMid', 'mid'];
        bot.holdNode = holds[idx % holds.length];
        bot.role = 'holder';
        setPath(bot, bot.holdNode);
      }
    }
  }

  function step(dt, time, bomb) {
    const report = { carrierPlanting: false, carrierSite: null, defuserPresent: false };
    for (const bot of list) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.45);
          bot.group.rotation.x = -bot.fall * 1.5;
        }
        continue;
      }
      // Buy phase is freeze time: bots hold at spawn and do not shoot.
      if (env.phase() === 'buy') continue;
      bot.pauseTimer = Math.max(0, bot.pauseTimer - dt);
      bot.perceiveTimer -= dt;
      if (bot.perceiveTimer <= 0) {
        bot.perceiveTimer = 0.2;
        const seen = visibleEnemy(bot);
        if (seen) {
          if (!bot.target) bot.reactionAt = time + 0.35 + random() * 0.45;
          bot.target = seen;
          bot.lastSeenAt = time;
        } else if (bot.target && time - bot.lastSeenAt > 2) {
          bot.target = null;
        }
      }

      // Hearing: a recent gunshot nearby pulls an idle bot to investigate.
      if (!bot.target && bot.investigate === null) {
        const heard = env.hear(bot.group.position.x, bot.group.position.z, time);
        if (heard) bot.investigate = { x: heard.x, z: heard.z, until: time + 4 };
      }
      if (bot.investigate && time > bot.investigate.until) bot.investigate = null;

      // Bomb duties come before moving.
      if (bot.team === 'atk' && bomb.state === 'dropped' && bomb.pos) {
        const dx = bomb.pos.x - bot.group.position.x;
        const dz = bomb.pos.z - bot.group.position.z;
        if (Math.hypot(dx, dz) < 1.2) {
          env.onBombPickup(bot);
        } else {
          let nearest = null;
          let nearestDist = Infinity;
          for (const other of list) {
            if (!other.alive || other.team !== 'atk') continue;
            const d = Math.hypot(bomb.pos.x - other.group.position.x, bomb.pos.z - other.group.position.z);
            if (d < nearestDist) {
              nearestDist = d;
              nearest = other;
            }
          }
          if (nearest === bot) {
            const node = nearestWaypoint(bomb.pos.x, bomb.pos.z);
            if (bot.path[bot.path.length - 1] !== node) setPath(bot, node);
            followPath(bot, dt);
            continue;
          }
        }
      }
      if (bot.team === 'atk' && bomb.state === 'carried' && bomb.carrier === bot.id && bomb.site) {
        const site = world.sites[bomb.site];
        const dist = Math.hypot(site.center.x - bot.group.position.x, site.center.z - bot.group.position.z);
        if (dist < site.radius && !bot.target) {
          report.carrierPlanting = true;
          report.carrierSite = bomb.site;
          continue;
        }
      }
      if (bot.team === 'def' && bomb.state === 'planted' && bomb.site) {
        const site = world.sites[bomb.site];
        const dist = Math.hypot(site.center.x - bot.group.position.x, site.center.z - bot.group.position.z);
        if (dist < site.radius && !bot.target) {
          report.defuserPresent = true;
          continue;
        }
        const node = bomb.site === 'A' ? 'aSite' : 'bSite';
        if (bot.path[bot.path.length - 1] !== node) setPath(bot, node);
        followPath(bot, dt);
        continue;
      }

      if (bot.target && time >= bot.reactionAt) {
        // Face the target and fire in bursts; strafe slowly while shooting.
        const p = bot.target.point;
        const dx = p.x - bot.group.position.x;
        const dz = p.z - bot.group.position.z;
        const targetYaw = Math.atan2(-dx, -dz);
        let diff = targetYaw - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        bot.yaw += Math.max(-8 * dt, Math.min(8 * dt, diff));
        bot.group.rotation.y = bot.yaw;
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.9 + random() * 0.8;
          bot.strafeDir = -bot.strafeDir;
        }
        const strafeX = Math.cos(bot.yaw) * bot.strafeDir * bot.speed * 0.35 * dt;
        const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir * bot.speed * 0.35 * dt;
        if (!overlaps(bot.group.position.x + strafeX, bot.group.position.z)) bot.group.position.x += strafeX;
        if (!overlaps(bot.group.position.x, bot.group.position.z + strafeZ)) bot.group.position.z += strafeZ;
        fireAt(bot, bot.target);
      } else if (bot.investigate) {
        const arrived = moveToward(bot, bot.investigate.x, bot.investigate.z, dt);
        if (arrived) bot.investigate = null;
      } else if (bot.pathIndex < bot.path.length) {
        followPath(bot, dt);
      } else if (bot.team === 'def') {
        // Hold and scan the angle.
        bot.scanPhase += dt * 0.7;
        bot.yaw += Math.sin(bot.scanPhase) * 0.35 * dt;
        bot.group.rotation.y = bot.yaw;
      }
    }
    return report;
  }

  return {
    list,
    hitMeshes,
    damage,
    reset,
    step,
    aliveCount(team) {
      return list.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return list.find((b) => b.alive && b.role === 'carrier') || null;
    },
    aimPoint(index) {
      const alive = list.filter((b) => b.alive);
      const bot = alive[index % Math.max(1, alive.length)];
      if (!bot) return new THREE.Vector3(0, 1.2, -6);
      return new THREE.Vector3(bot.group.position.x, 1.2, bot.group.position.z);
    },
  };
}
