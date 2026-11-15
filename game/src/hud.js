// The HUD: every DOM readout, the buy menu, the killfeed, banners and overlays.
// The DOM lives in index.html; this module only reads elements by id and writes
// text, classes and styles. Nothing here touches the simulation.
import { WEAPONS, WEAPON_ORDER, GRENADES, GRENADE_ORDER } from './weapons.js';
import { ARMOR_COST } from './rounds.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const killfeed = el('killfeed');
  let playCallback = null;
  let buyCallback = null;
  let hitTimer = null;

  // Build the buy menu from the weapon and grenade tables.
  const buyList = el('buy-list');
  const items = [];
  for (const kind of WEAPON_ORDER) {
    const def = WEAPONS[kind];
    items.push({ key: kind, kind: 'weapon', label: `${def.name} — $${def.cost}`, cost: def.cost });
  }
  for (const kind of GRENADE_ORDER) {
    const def = GRENADES[kind];
    items.push({ key: kind, kind: 'grenade', label: `${def.name} — $${def.cost}`, cost: def.cost });
  }
  items.push({ key: 'armor', kind: 'armor', label: `Vest +50 armor — $${ARMOR_COST}`, cost: ARMOR_COST });
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.key = item.key;
    button.dataset.kind = item.kind;
    button.innerHTML = `<span>${item.label}</span><span class="buy-cost">$${item.cost}</span>`;
    button.addEventListener('click', () => {
      if (buyCallback) buyCallback(item.kind, item.key);
    });
    buyList.appendChild(button);
  }

  function setBuyEnabled(money, ownedWeapons, ownedGrenades, armor) {
    for (const button of buyList.children) {
      const kind = button.dataset.kind;
      const key = button.dataset.key;
      let disabled = false;
      let owned = false;
      if (kind === 'weapon') {
        owned = ownedWeapons.includes(key);
        disabled = owned || money < WEAPONS[key].cost;
      } else if (kind === 'grenade') {
        disabled = money < GRENADES[key].cost;
      } else {
        owned = armor >= 50;
        disabled = owned || money < ARMOR_COST;
      }
      button.disabled = disabled;
      button.classList.toggle('owned', owned);
    }
  }

  return {
    onPlay(callback) {
      playCallback = callback;
    },
    onBuy(callback) {
      buyCallback = callback;
    },
    setHealth(health, armor) {
      el('health-value').textContent = String(Math.ceil(health));
      el('armor-value').textContent = String(Math.ceil(armor));
      el('health').classList.toggle('low', health <= 30);
    },
    setAmmo(mag, reserve) {
      el('ammo-mag').textContent = String(mag);
      el('ammo-reserve').textContent = `/ ${reserve}`;
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      el('weapon-name').textContent = name;
    },
    setGrenades(counts) {
      el('grenade-he').textContent = `HE ${counts.he}`;
      el('grenade-smoke').textContent = `Smoke ${counts.smoke}`;
      el('grenade-flash').textContent = `Flash ${counts.flash}`;
    },
    setMoney(money) {
      el('money-value').textContent = `$${money}`;
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      el('timer-value').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
    setScore(atk, def, round) {
      el('score-atk').textContent = String(atk);
      el('score-def').textContent = String(def);
      el('round-label').textContent = `ROUND ${round}`;
    },
    setBomb(text) {
      el('bomb-status').textContent = text;
    },
    setCrosshairGap(px) {
      el('crosshair').style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setInteract(text) {
      const node = el('interact');
      node.textContent = text ?? '';
      node.hidden = text === null || text === undefined;
    },
    hitMarker(killed, holdMs = 90) {
      const marker = el('hitmarker');
      marker.classList.add('on');
      marker.classList.toggle('kill', killed);
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => marker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      const node = el('damage');
      node.classList.remove('on');
      void node.offsetWidth;
      node.classList.add('on');
    },
    flashbang(strength) {
      const node = el('flash');
      node.style.opacity = String(Math.max(0, Math.min(1, strength)));
      if (strength > 0) {
        setTimeout(() => {
          node.style.opacity = '0';
        }, 1200);
      }
    },
    killfeedAdd(text, friendly) {
      const line = document.createElement('div');
      line.className = friendly ? 'kill friendly' : 'kill';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
    },
    showBanner(title, sub) {
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub ?? '';
      el('banner').hidden = false;
    },
    hideBanner() {
      el('banner').hidden = true;
    },
    showBuy(money, ownedWeapons, ownedGrenades, armor) {
      setBuyEnabled(money, ownedWeapons, ownedGrenades, armor);
      el('buy-menu').hidden = false;
    },
    hideBuy() {
      el('buy-menu').hidden = true;
    },
    refreshBuy(money, ownedWeapons, ownedGrenades, armor) {
      setBuyEnabled(money, ownedWeapons, ownedGrenades, armor);
    },
    showOverlay(kind, data = {}) {
      const overlay = el('overlay');
      const title = el('overlay-title');
      const copy = el('overlay-copy');
      const play = el('play');
      if (kind === 'start') {
        title.textContent = 'SALTWORKS';
        copy.textContent = 'A decommissioned saltworks at dusk. Plant the charge at A or B — or stop the Breakers cold. First to 5 rounds takes the match.';
        play.textContent = 'Click to play';
      } else if (kind === 'paused') {
        title.textContent = 'Paused';
        copy.textContent = 'Click to get back in. Your team holds the line without you.';
        play.textContent = 'Resume';
      } else if (kind === 'end') {
        title.textContent = data.title ?? 'Round over';
        copy.textContent = data.copy ?? '';
        play.textContent = 'Next round';
      } else if (kind === 'match') {
        title.textContent = data.title ?? 'Match over';
        copy.textContent = data.copy ?? '';
        play.textContent = 'Play again';
      }
      overlay.hidden = false;
      if (playCallback) {
        play.onclick = () => playCallback(kind);
      }
    },
    hideOverlay() {
      el('overlay').hidden = true;
    },
  };
}
