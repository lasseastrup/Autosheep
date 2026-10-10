/**
 * A frame-rate test to run on the device that is slow: it turns the expensive parts of a
 * frame off one at a time and measures each, so a screenshot of the results says where the
 * time goes. Plain HTML, so it can be read (and copied) whatever the game is doing.
 */

export interface Variant {
  name: string;
  /** turn this variant's change on (true) or back off (false) */
  apply?: (on: boolean) => void;
  /** false: run the game without drawing at all */
  draw?: boolean;
}

export interface Result {
  name: string;
  fps: number;
  ms: number;
}

const SETTLE = 1;
const MEASURE = 2;

export class PerfTest {
  readonly results: Result[] = [];
  private i = 0;
  private t = 0;
  private frames = 0;
  private time = 0;
  private busy = 0;
  private readonly panel: HTMLDivElement;
  private lastLabel = '';

  constructor(private readonly variants: Variant[], private readonly device: string[]) {
    this.panel = document.createElement('div');
    this.panel.id = 'perftest';
    Object.assign(this.panel.style, {
      position: 'fixed', left: '50%', top: '8px', transform: 'translateX(-50%)', zIndex: '11',
      font: '10px/1.45 Silkscreen, ui-monospace, Menlo, monospace', color: '#c7dcd0',
      background: 'rgba(46, 34, 47, 0.94)', border: '1px solid #fbb954', padding: '8px 14px',
      maxWidth: '94vw', maxHeight: '92vh', overflow: 'auto', touchAction: 'pan-y', userSelect: 'text',
    });
    // taps on the panel are for the panel, not for steering Gafoop
    this.panel.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target instanceof Element && e.target.closest('.close')) this.panel.remove();
    });
    document.body.appendChild(this.panel);
    variants[0].apply?.(true);
    this.show();
  }

  get done(): boolean {
    return this.i >= this.variants.length;
  }

  /** Whether to draw this frame. */
  get draw(): boolean {
    return this.done || this.variants[this.i].draw !== false;
  }

  /**
   * Once a frame, before it runs.
   * @param dt  time since the last frame (s)
   * @param ms  main-thread time the last frame took
   */
  tick(dt: number, ms: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.t > SETTLE) {
      this.frames++;
      this.time += dt;
      this.busy += ms;
    }
    if (this.t >= SETTLE + MEASURE) {
      const v = this.variants[this.i];
      this.results.push({ name: v.name, fps: this.frames / Math.max(this.time, 1e-6), ms: this.busy / Math.max(this.frames, 1) });
      v.apply?.(false);
      this.i++;
      this.t = this.frames = this.time = this.busy = 0;
      if (this.done) this.finish();
      else this.variants[this.i].apply?.(true);
    }
    this.show();
  }

  private show(): void {
    if (this.done) return;
    const left = Math.ceil((this.variants.length - this.i) * (SETTLE + MEASURE) - this.t);
    const label = `PERF TEST ${this.i + 1}/${this.variants.length}: ${this.variants[this.i].name.toUpperCase()} · HANDS OFF FOR ${left} S`;
    if (label !== this.lastLabel) this.panel.textContent = this.lastLabel = label;
  }

  private finish(): void {
    const base = this.results[0];
    const rows = this.results
      .map((r) => {
        const d = r.fps - base.fps;
        const gain = r === base ? '' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
        return `<tr><td>${r.name}</td><td>${r.fps.toFixed(1)}</td><td>${gain}</td><td>${r.ms.toFixed(1)}</td></tr>`;
      })
      .join('');
    this.panel.innerHTML = `<span class="close" style="float:right;color:#fbb954;cursor:pointer;padding:0 0 6px 16px">✕</span>
      <div style="color:#fbb954">PERF TEST RESULTS</div>
      <div style="color:#9babb2">${this.device.join('<br>')}</div>
      <table style="border-collapse:collapse;margin-top:6px">
        <tr style="color:#9babb2"><td>WHAT</td><td>FPS</td><td>CHANGE</td><td>JS MS</td></tr>${rows}
      </table>
      <div style="color:#7f708a;margin-top:6px;max-width:420px">JS MS: THE JAVASCRIPT PART OF EACH FRAME; THE REST IS THE GPU AND THE BROWSER. A SCREENSHOT OF THIS SAYS WHERE THE TIME GOES.</div>`;
    for (const td of this.panel.querySelectorAll('td')) Object.assign((td as HTMLElement).style, { padding: '0 14px 0 0', whiteSpace: 'nowrap' });
    console.info(`[autosheep] perf test\n${this.device.join('\n')}\n${this.results.map((r) => `${r.name}: ${r.fps.toFixed(1)} fps, ${r.ms.toFixed(1)} ms main thread`).join('\n')}`);
  }
}
