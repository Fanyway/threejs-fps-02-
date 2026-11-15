// Procedural sound: every effect is synthesized with WebAudio, so the game
// ships no audio files. A tiny noise buffer is reused for shots and impacts;
// tones cover beeps, clicks and round stingers. Silent until the first user
// gesture creates the context (browsers require it).
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.3, dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      if (kind === 'sniper') noise(0.28, 900, 0.5);
      else if (kind === 'smg') noise(0.09, 1600, 0.28);
      else if (kind === 'pistol') noise(0.12, 1300, 0.32);
      else noise(0.14, 1100, 0.38);
      tone(180, 0.07, 0.12, 'square', 90);
    },
    dryFire() {
      tone(1400, 0.03, 0.08, 'square');
    },
    reload() {
      tone(700, 0.05, 0.1, 'square');
      setTimeout(() => tone(500, 0.05, 0.1, 'square'), 160);
    },
    hit() {
      tone(1200, 0.05, 0.12, 'sine');
    },
    kill() {
      tone(880, 0.09, 0.14, 'sine', 1320);
    },
    hurt() {
      noise(0.12, 500, 0.25);
      tone(140, 0.12, 0.14, 'sawtooth', 70);
    },
    plantBeep() {
      tone(1050, 0.08, 0.12, 'square');
    },
    bombBeep() {
      tone(1500, 0.06, 0.1, 'square');
    },
    explosion() {
      noise(0.7, 320, 0.6);
      tone(70, 0.5, 0.3, 'sine', 35);
    },
    pop() {
      noise(0.2, 2400, 0.2, 'highpass');
    },
    roundWin() {
      tone(523, 0.14, 0.14, 'sine');
      setTimeout(() => tone(659, 0.14, 0.14, 'sine'), 130);
      setTimeout(() => tone(784, 0.22, 0.16, 'sine'), 260);
    },
    roundLose() {
      tone(392, 0.16, 0.14, 'sine');
      setTimeout(() => tone(311, 0.26, 0.14, 'sine'), 150);
    },
    buy() {
      tone(980, 0.06, 0.1, 'sine');
      setTimeout(() => tone(1240, 0.08, 0.1, 'sine'), 70);
    },
  };
}
