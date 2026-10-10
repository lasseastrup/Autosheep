/**
 * Saving the valley: everything that persists, as plain JSON in the browser's storage. Sheep
 * are saved at the contract level (where each stands, which way it faces, how hungry it is);
 * the flock model starts afresh from that, as the design says (DESIGN.md §13.1).
 */
import type { Device } from '../works/devices';
import type { Unlock } from './forms';

export const SAVE_KEY = 'autosheep.valley.v1';

export interface Snapshot {
  v: 1;
  /** the Form being worked on, and whether it has been approved (its card dismissed or not) */
  form: number;
  approved: boolean;
  unlocked: Unlock[];
  /** counters at the Form's arrival, so goals count from there */
  base: { handFleece: number; yarn: number };
  handFleece: number;
  unattended: number;
  woofed: number[];
  /** seconds on the Form's clock */
  clock: number;
  time: number;
  gafoop: { x: number; y: number };
  sheep: { x: number; y: number; heading: number; hunger: number; wool: number; pack: number }[];
  devices: Device[];
  gates: [number, boolean, boolean][];
  feed: [number, number][];
  works: { yarn: number; fleece: number; shorn: number; autoYarn: number; stock: { fleece: number; yarn: number }; clock: number };
  /** grass lengths, a byte a cell, base64 */
  grass: string;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Read the saved valley, if there is a usable one. Storage can be missing or throw. */
export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    return s && s.v === 1 && Array.isArray(s.sheep) && Array.isArray(s.devices) ? s : null;
  } catch {
    return null;
  }
}

export function storeSnapshot(s: Snapshot): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing to clear
  }
}
