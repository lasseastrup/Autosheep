/**
 * Loading steps you can see. Every slow piece of start-up runs as a named step; the page is
 * allowed to paint before each one starts, so if the screen freezes it is frozen showing the
 * step that is to blame. A watcher records every long frame (a stall) and which steps were
 * running at the time. All of it is in a log: press L, or tap the status line.
 *
 * Plain HTML on purpose: it works before any WebGL canvas exists and across the switch from
 * the intro's canvas to the game's.
 */

export interface StepRecord {
  name: string;
  start: number;
  end?: number;
  error?: string;
}

export interface Stall {
  at: number;
  ms: number;
  /** the loading steps running during the stall, or null when none was */
  during: string | null;
}

const STALL_MS = 100;

/** Resolves after the browser has painted whatever was changed before the call. */
export function afterPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

class Loader {
  readonly steps: StepRecord[] = [];
  readonly stalls: Stall[] = [];
  private root: HTMLDivElement | null = null;
  /** the panel inside the root; it is the scroll container, so it stays and only its contents change */
  private panel: HTMLDivElement | null = null;
  private html = '';
  private mode: 'boot' | 'status' | 'hidden' = 'hidden';
  private showLog = false;
  private doneAt = 0;
  private enabled = true;

  /** Turn the whole thing off (movie capture, tooling). Steps still run, silently. */
  disable(): void {
    this.enabled = false;
    this.root?.remove();
    this.root = null;
  }

  /** The full-screen loading panel, shown until `status()` is called. */
  boot(): void {
    if (!this.enabled) return;
    this.mode = 'boot';
    this.ensureDom();
    this.watchStalls();
    this.render();
  }

  /** Shrink to a status line in the corner (the menu is up; work continues behind it). */
  status(): void {
    this.mode = 'status';
    this.render();
  }

  toggleLog(): void {
    this.showLog = !this.showLog;
    this.render();
  }

  /** Run `fn` as a named step. Waits for a paint first, so the step's name is on screen. */
  async step<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const rec: StepRecord = { name, start: performance.now() };
    this.steps.push(rec);
    this.render();
    if (this.enabled) await afterPaint();
    rec.start = performance.now();
    try {
      const v = await fn();
      rec.end = performance.now();
      return v;
    } catch (e) {
      rec.end = performance.now();
      rec.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      console.info(`[autosheep] ${name}: ${rec.error ? `failed (${rec.error})` : fmt(rec.end! - rec.start)}`);
      if (!this.running().length) this.doneAt = performance.now();
      this.render();
    }
  }

  running(): StepRecord[] {
    return this.steps.filter((s) => s.end === undefined);
  }

  /** The step to name when something is waited for: the latest running one, optionally only
   * among those whose names start with one of `prefixes`. */
  current(prefixes?: readonly string[]): string | null {
    const r = this.running().filter((s) => !prefixes || prefixes.some((p) => s.name.startsWith(p)));
    return r.length ? r[r.length - 1].name : null;
  }

  private watchStalls(): void {
    let last = performance.now();
    const tick = (now: number) => {
      const gap = now - last;
      if (gap > STALL_MS && document.visibilityState === 'visible') {
        // the suspects: every step that was running at some point during the gap
        const during = this.steps.filter((s) => s.start < now && (s.end === undefined || s.end > last)).map((s) => s.name);
        this.stalls.push({ at: last, ms: gap, during: during.length ? during.join(', ') : null });
        // keep every loading stall, and only the latest of the rest
        const play = this.stalls.filter((x) => x.during === null);
        if (play.length > 50) this.stalls.splice(this.stalls.indexOf(play[0]), 1);
        if (this.showLog) this.render();
      }
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private ensureDom(): void {
    if (this.root) return;
    const style = document.createElement('style');
    style.textContent = `
      #loading { position: fixed; z-index: 10; font: 12px/1.5 Silkscreen, ui-monospace, Menlo, Consolas, monospace; color: #c7dcd0; }
      #loading.boot { inset: 0; display: flex; align-items: center; justify-content: center; background: #18141a; }
      #loading.status { left: 12px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); cursor: pointer; }
      #loading .panel { background: #2e222f; border: 1px solid #fbb954; padding: 14px 18px; min-width: min(360px, 80vw); max-width: 92vw; max-height: 80vh; overflow: auto; touch-action: pan-y; overscroll-behavior: contain; }
      #loading.status .panel { background: rgba(24, 20, 26, 0.85); border-color: #625565; padding: 4px 8px; min-width: 0; }
      #loading.status.log { left: 50%; top: 50%; bottom: auto; transform: translate(-50%, -50%); cursor: default; }
      #loading.status.log .panel { padding: 12px 48px 12px 16px; border-color: #fbb954; background: #2e222f; }
      #loading h1 { margin: 0 0 8px; font: 16px "Pixelify Sans", ui-monospace, monospace; color: #fbb954; letter-spacing: 1px; }
      #loading .row { display: flex; gap: 16px; justify-content: space-between; white-space: nowrap; }
      #loading .done { color: #9babb2; }
      #loading .run { color: #f9c22b; }
      #loading .err, #loading .stall { color: #e83b3b; }
      #loading .row.stall { white-space: normal; }
      #loading .row.stall span:first-child { flex: none; white-space: nowrap; }
      #loading .row.stall span:last-child { text-align: right; }
      #loading .hint { color: #625565; margin-top: 8px; white-space: normal; max-width: 420px; }
      #loading .close { display: none; position: absolute; top: 1px; right: 1px; padding: 10px 16px; color: #fbb954; cursor: pointer; }
      #loading.log .close { display: block; }
      #loading.log .panel { padding-right: 48px; }
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'loading';
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.root.appendChild(this.panel);
    // outside the panel, so it does not scroll away with the log
    const close = document.createElement('span');
    close.className = 'close';
    close.textContent = '✕';
    this.root.appendChild(close);
    // the status line opens the log, ✕ or L closes it (so the open log can be scrolled by
    // touch); either way the click must not reach the page behind it
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const close = e.target instanceof Element && e.target.closest('.close');
      if (close || (this.mode === 'status' && !this.showLog)) this.toggleLog();
    });
    document.body.appendChild(this.root);
    // registered before the menu's and the game's key handlers, so L is only ever this
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'l' && e.key !== 'L') return;
      e.stopImmediatePropagation();
      if (!e.repeat) this.toggleLog();
    });
  }

  private render(): void {
    if (!this.root || !this.enabled) return;
    const log = this.showLog;
    this.root.className = `${this.mode}${log ? ' log' : ''}`;
    const html = this.content();
    this.root.style.display = html ? '' : 'none';
    if (html !== this.html) this.panel!.innerHTML = this.html = html;
  }

  private content(): string {
    const now = performance.now();
    const running = this.running();
    const log = this.showLog;
    const row = (s: StepRecord) => {
      const cls = s.error ? 'err' : s.end === undefined ? 'run' : 'done';
      const right = s.error ? 'failed' : s.end === undefined ? '…' : fmt(s.end - s.start);
      return `<div class="row ${cls}"><span>${s.end === undefined ? '▸' : s.error ? '✗' : '✓'} ${s.name}</span><span>${right}</span></div>`;
    };
    if (this.mode === 'boot' || log) {
      // stalls during loading steps are the point of this log; stalls in plain play (a slow
      // device, a busy tab) are summarised so they cannot push the loading ones out
      const stallRow = (s: Stall) => `<div class="row stall"><span>${fmt(s.ms)} at ${fmt(s.at)}</span><span>${s.during ?? 'playing'}</span></div>`;
      const loadStalls = this.stalls.filter((s) => s.during !== null);
      const playStalls = this.stalls.filter((s) => s.during === null);
      let stalls = '';
      if (log && loadStalls.length) stalls += `<div class="hint">STALLS DURING LOADING (FRAMES OVER ${STALL_MS} MS)</div>` + loadStalls.map(stallRow).join('');
      if (log && playStalls.length) {
        stalls += `<div class="hint">STALLS WHILE PLAYING: ${playStalls.length}, THE LATEST:</div>` + playStalls.slice(-5).map(stallRow).join('');
      }
      const title = log ? 'LOADING LOG' : 'AUTOSHEEP IS LOADING';
      const hint = log
        ? 'TIMES ARE FROM PAGE LOAD; STEPS OVERLAP, SO ONE CAN WAIT BEHIND ANOTHER · L OR ✕ TO CLOSE · ALSO IN THE CONSOLE'
        : 'IF THIS FREEZES, THE YELLOW LINE IS WHY';
      const list = log ? this.steps : this.steps.slice(-12);
      return `<h1>${title}</h1>${list.map(row).join('')}${stalls}<div class="hint">${hint}</div>`;
    }
    if (this.mode === 'hidden') return '';
    // status line: what is still being prepared, then a few seconds of "ready"
    if (running.length) return `<div class="run">preparing: ${running.map((s) => s.name).join(' · ')}</div>`;
    if (now - this.doneAt < 5000 && this.steps.length) {
      setTimeout(() => this.render(), 5000 - (now - this.doneAt) + 20);
      return `<div class="done">ready (${fmt(this.doneAt)} after load) · L for the loading log</div>`;
    }
    return '';
  }
}

export const loader = new Loader();
