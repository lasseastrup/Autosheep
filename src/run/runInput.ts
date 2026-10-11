import type { RunButton } from './runHud';
import { H, W } from './runHud';
import type { RunGame } from './runGame';

/**
 * Mouse, touch and keys for the survivors run. A mouse steers Gafoop by hovering and holds the
 * bucket with a button; a finger that goes down anywhere but on a button is a stick, centred
 * where it went down, so one thumb flies while the other holds BUCKET; keys fly with WASD.
 */
export function wireRunInput(game: RunGame, el: HTMLCanvasElement): void {
  const inp = game.input;
  const toOverlay = (e: PointerEvent): { x: number; y: number } | null => {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return x >= 0 && x <= W && y >= 0 && y <= H ? { x, y } : null;
  };
  // what each pointer (the mouse, or each finger) is doing
  const roles = new Map<number, RunButton | 'stick' | 'mouse'>();
  window.addEventListener('pointerdown', (e) => {
    const p = toOverlay(e);
    if (!p) return;
    if (e.pointerType !== 'mouse' && !game.touch) game.touch = true;
    const b = game.buttonAt(p.x, p.y);
    if (b) {
      roles.set(e.pointerId, b);
      game.buttonDown(b);
      return;
    }
    if (e.pointerType === 'mouse') {
      roles.set(e.pointerId, 'mouse');
      inp.pointer = p;
      inp.mouseBucket = (e.buttons & 3) !== 0;
    } else {
      roles.set(e.pointerId, 'stick');
      inp.stick = { ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
  });
  window.addEventListener('pointermove', (e) => {
    const p = toOverlay(e);
    if (e.pointerType === 'mouse') inp.pointer = p;
    else if (p && roles.get(e.pointerId) === 'stick' && inp.stick) {
      inp.stick.x = p.x;
      inp.stick.y = p.y;
    }
  });
  const up = (e: PointerEvent) => {
    const r = roles.get(e.pointerId);
    roles.delete(e.pointerId);
    if (r === 'stick') inp.stick = null;
    else if (r && r !== 'mouse') game.buttonUp(r);
    if (e.pointerType === 'mouse') inp.mouseBucket = (e.buttons & 3) !== 0 && r === 'mouse';
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (!e.repeat) inp.hits.push(k);
    inp.keys.add(k);
  });
  window.addEventListener('keyup', (e) => inp.keys.delete(e.key.toLowerCase()));
  window.addEventListener('wheel', (e) => {
    if (e.target instanceof Element && e.target.closest('#loading')) return;
    e.preventDefault();
    inp.wheel += Math.sign(e.deltaY);
  }, { passive: false });
  window.addEventListener('blur', () => {
    inp.keys.clear();
    inp.mouseBucket = false;
    inp.stick = null;
    for (const r of roles.values()) if (r !== 'stick' && r !== 'mouse') game.buttonUp(r);
    roles.clear();
  });
}
