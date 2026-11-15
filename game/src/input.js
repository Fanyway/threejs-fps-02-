// Keyboard + mouse input: a set of held codes, accumulated look deltas, firing
// state and pointer lock. The simulation reads this; the DOM never does.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    firing: false,
    lookX: 0,
    lookY: 0,
    locked: false,
  };

  function takeLook() {
    const look = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return look;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0 && state.locked) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    state.firing = false;
    onLockChange(state.locked);
  });

  return {
    state,
    takeLook,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };
}
