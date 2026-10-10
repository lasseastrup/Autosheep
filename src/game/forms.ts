/**
 * Bureau Forms (M2b): the goals of the game, one after another, in one persistent valley. Each
 * Form asks for something, arrives with a supply drop and the tools to do it, and once it is
 * approved unlocks more. They replace M1/M2's levels.
 */
import type { Works } from '../works/works';
import { dropPen, dropStations } from './valley';

/** Things Gafoop gets to do, or build. */
export type Unlock =
  | 'build' | 'hurdle' | 'gate' | 'trough' | 'stations'
  | 'shears' | 'spin' | 'woof' | 'timerGate' | 'grassGate';

export type Goal =
  /** every sheep in the valley's pen, and the pen's gate shut */
  | { kind: 'pen' }
  /** fleeces shorn by hand since the Form arrived */
  | { kind: 'fleece'; n: number }
  /** skeins made since the Form arrived, by hand or by spindle hut */
  | { kind: 'yarn'; n: number }
  /** sheep sent through a gate by the Woof-Woof (each counted once) */
  | { kind: 'woofed'; n: number }
  /** skeins made by spindle huts while Gafoop leaves the flock alone (no bucket, no woof, no
   * gate opened by hand for the last little while) */
  | { kind: 'unattended'; n: number }
  /** nothing: the last Form for now */
  | { kind: 'none' };

export interface FormSpec {
  code: string;
  title: string;
  goal: Goal;
  /** what Gafoop says when it arrives */
  opening: string;
  /** what the supply drop puts in the valley */
  drop?: (w: Works) => void;
  /** tools that come with it, and what its approval unlocks */
  grants?: Unlock[];
  unlocks?: Unlock[];
  /** the approval card: the result (with {time} and {n}) and the Bureau's remark */
  verdict: [string, string];
  /** what the SOLVE cheat does for it */
  solve: 'pen' | 'fleece' | 'rotation' | 'woofed' | 'none';
}

export const FORMS: readonly FormSpec[] = [
  {
    code: '8-A',
    title: 'PEN THE FLOCK',
    goal: { kind: 'pen' },
    opening: 'A pen, from the Bureau. They will follow the bucket. In they go, then shut the gate.',
    drop: dropPen,
    unlocks: ['build', 'hurdle', 'gate'],
    verdict: ['{n} sheep penned in {time}.', 'A MEASURABLE INCREASE IN ORGANISATION IS NOTED.'],
    solve: 'pen',
  },
  {
    code: '10-B',
    title: 'TEN FLEECES',
    goal: { kind: 'fleece', n: 10 },
    opening: 'Shears! Hold SHEAR beside a woolly one while it stands still. They hardly mind.',
    grants: ['shears'],
    unlocks: ['spin'],
    verdict: ['Ten fleeces in {time}.', 'THE BUREAU NOTES WOOL. THE BUREAU REQUESTS IT BE TWISTED.'],
    solve: 'fleece',
  },
  {
    code: '12-C',
    title: 'TWENTY SKEINS',
    goal: { kind: 'yarn', n: 20 },
    opening: 'Twenty skeins! Spin by hand, or fence two paddocks round the shed and the spindle hut.',
    drop: dropStations,
    grants: ['spin', 'trough', 'stations'],
    unlocks: ['woof'],
    verdict: ['Twenty skeins in {time}.', 'INDUSTRY IS PROVEN. THE AUDITOR YAWNS APPROVINGLY.'],
    solve: 'rotation',
  },
  {
    code: '27-B',
    title: 'COERCIVE APPARATUS',
    goal: { kind: 'woofed', n: 20 },
    opening: 'The Woof-Woof 3000! Hold WOOF and they run from me. Woof twenty through a gate.',
    grants: ['woof'],
    unlocks: ['timerGate', 'grassGate'],
    verdict: ['Twenty woofed through in {time}.', 'COERCION APPROVED. WOOL YIELDS MAY SUFFER. NOTED.'],
    solve: 'woofed',
  },
  {
    code: '31-A',
    title: 'INDUSTRY UNSUPERVISED',
    goal: { kind: 'unattended', n: 12 },
    opening: 'Twelve skeins made while I do nothing at all. Timed gates and grass gates approved.',
    grants: ['timerGate', 'grassGate'],
    verdict: ['Twelve unsupervised skeins in {time}.', 'AUTOMATION ACHIEVED. THE AUDITOR SENDS A STRONGLY WORDED COMPLIMENT.'],
    solve: 'rotation',
  },
  {
    code: '40-K',
    title: 'AWAIT AUDIT I',
    goal: { kind: 'none' },
    opening: 'The Auditor is coming. Eventually. Keep the wool flowing, troops.',
    verdict: ['', ''],
    solve: 'none',
  },
];

/** How far along a goal is: done of total, and the word for what is counted. */
export function goalLabel(g: Goal): { label: string; icon: 'sheep' | 'yarn' | 'fleece' } {
  switch (g.kind) {
    case 'pen': return { label: 'PENNED', icon: 'sheep' };
    case 'fleece': return { label: 'FLEECE', icon: 'fleece' };
    case 'woofed': return { label: 'WOOFED', icon: 'sheep' };
    case 'yarn':
    case 'unattended':
    case 'none':
      return { label: g.kind === 'unattended' ? 'UNSUPERV.' : 'YARN', icon: 'yarn' };
  }
}
