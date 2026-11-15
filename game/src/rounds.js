// Rounds, economy and the bomb: a buy phase, a live round, a short end card.
// First to 5 rounds wins the match (at most 9 rounds). The player starts each
// match carrying the bomb; if the player dies it drops, and the nearest living
// attacker bot picks it up. All money is the player's: kills pay, wins pay more.
import { WEAPONS, GRENADES } from './weapons.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 5;
export const FUSE_SECONDS = 40;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const ARMOR_COST = 650;

export function createRounds(random) {
  const state = {
    phase: 'buy',
    round: 1,
    scoreAtk: 0,
    scoreDef: 0,
    timer: BUY_SECONDS,
    money: 800,
    armor: 0,
    targetSite: 'A',
    bomb: { state: 'carried', carrier: 'player', site: null, plantProgress: 0, defuseProgress: 0, fuseLeft: 0, pos: null },
  };

  function resetBomb() {
    state.bomb = { state: 'carried', carrier: 'player', site: null, plantProgress: 0, defuseProgress: 0, fuseLeft: 0, pos: null };
  }

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreAtk = 0;
    state.scoreDef = 0;
    state.timer = BUY_SECONDS;
    state.money = 800;
    state.armor = 0;
    state.targetSite = random() > 0.5 ? 'A' : 'B';
    resetBomb();
  }

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.targetSite = random() > 0.5 ? 'A' : 'B';
    resetBomb();
  }

  function endRound(winner, reason) {
    if (winner === 'atk') state.scoreAtk += 1;
    else state.scoreDef += 1;
    if (winner === 'atk') state.money += 3250;
    else state.money += 1400;
    state.phase = 'end';
    state.timer = END_SECONDS;
    const events = [{ type: 'roundEnd', winner, reason, scoreAtk: state.scoreAtk, scoreDef: state.scoreDef }];
    if (state.scoreAtk >= WIN_ROUNDS || state.scoreDef >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      const matchWinner = state.scoreAtk === state.scoreDef ? 'draw' : state.scoreAtk > state.scoreDef ? 'atk' : 'def';
      events.push({ type: 'matchEnd', winner: matchWinner, scoreAtk: state.scoreAtk, scoreDef: state.scoreDef });
    }
    return events;
  }

  function buyWeapon(kind) {
    const def = WEAPONS[kind];
    if (!def || def.cost === 0 || state.money < def.cost) return false;
    state.money -= def.cost;
    return true;
  }

  function buyGrenade(kind) {
    const def = GRENADES[kind];
    if (!def || state.money < def.cost) return false;
    state.money -= def.cost;
    return true;
  }

  function buyArmor() {
    if (state.money < ARMOR_COST || state.armor >= 50) return false;
    state.money -= ARMOR_COST;
    state.armor = 50;
    return true;
  }

  function step(dt, info) {
    const events = [];
    state.timer -= dt;
    const bomb = state.bomb;

    if (state.phase === 'buy') {
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        events.push({ type: 'phaseLive', targetSite: state.targetSite });
      }
      return events;
    }
    if (state.phase === 'end') {
      if (state.timer <= 0) {
        state.round += 1;
        startRound();
        events.push({ type: 'roundStart', round: state.round, targetSite: state.targetSite });
      }
      return events;
    }
    if (state.phase === 'match') return events;

    // Live round: planting, fuse, defuse, timer, eliminations.
    if (bomb.state === 'carried' || bomb.state === 'dropped') {
      let planting = false;
      let site = null;
      if (info.playerAlive && info.playerInSite && info.interactHeld) {
        planting = true;
        site = info.playerInSite;
      } else if (info.carrierBotPlanting) {
        planting = true;
        site = info.carrierBotSite;
      }
      if (planting) {
        bomb.plantProgress += dt / PLANT_SECONDS;
        if (bomb.plantProgress >= 1) {
          bomb.state = 'planted';
          bomb.site = site;
          bomb.fuseLeft = FUSE_SECONDS;
          bomb.plantProgress = 1;
          if (info.playerPlanted) {
            state.money += 300;
            events.push({ type: 'plantReward' });
          }
          events.push({ type: 'planted', site });
        }
      } else {
        bomb.plantProgress = Math.max(0, bomb.plantProgress - dt / PLANT_SECONDS);
      }
    }

    if (bomb.state === 'planted') {
      bomb.fuseLeft -= dt;
      if (info.defuserPresent) {
        bomb.defuseProgress += dt / DEFUSE_SECONDS;
        if (bomb.defuseProgress >= 1) {
          events.push(...endRound('def', 'defused'));
          return events;
        }
      } else {
        bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt / DEFUSE_SECONDS);
      }
      if (bomb.fuseLeft <= 0) {
        events.push({ type: 'detonated', site: bomb.site });
        events.push(...endRound('atk', 'detonated'));
        return events;
      }
    }

    if (state.timer <= 0) {
      if (bomb.state === 'planted') {
        // Fuse keeps running past the clock; the round only ends on detonation.
        state.timer = 0.01;
      } else {
        events.push(...endRound('def', 'time'));
        return events;
      }
    }

    if (info.atkAlive === 0) {
      events.push(...endRound('def', 'eliminated'));
      return events;
    }
    if (info.defAlive === 0) {
      events.push(...endRound('atk', 'eliminated'));
      return events;
    }
    return events;
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    buyWeapon,
    buyGrenade,
    buyArmor,
    step,
    addKillReward() {
      state.money += 300;
    },
  };
}
