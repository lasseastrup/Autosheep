/**
 * What level-ups offer (plan §8.4, S0's subset): Gafoop's stationery and the flock's gear
 * (armaments, which do damage) and provisions (passive stats), for Gafoop or for the flock.
 * Five slots of each; armaments go to level 6, provisions to 4.
 */
export type ItemId =
  | 'stamp' | 'stapler' | 'shredder' | 'crook' | 'bells' | 'static'
  | 'disc' | 'shears' | 'medal' | 'expedite' | 'fleece' | 'merino';

export interface ItemDef {
  id: ItemId;
  kind: 'armament' | 'provision';
  /** who carries it: Gafoop, or the flock */
  who: 'gafoop' | 'flock';
  name: string;
  max: number;
  /** the card's two lines: what it does when new, then what each next level adds */
  lines: [string, string][];
}

export const SLOTS = { armament: 5, provision: 5 };

export const ITEMS: Record<ItemId, ItemDef> = {
  stamp: {
    id: 'stamp', kind: 'armament', who: 'gafoop', name: 'RUBBER STAMP', max: 6,
    lines: [
      ['SLAMS APPROVED ALL ROUND GAFOOP', 'HITS EVERYTHING CLOSE, KNOCKS IT BACK'],
      ['HARDER AND WIDER', ''], ['HARDER, WIDER, SOONER', ''], ['HARDER AND WIDER', ''], ['HARDER, WIDER, SOONER', ''], ['A MUCH BIGGER STAMP', ''],
    ],
  },
  stapler: {
    id: 'stapler', kind: 'armament', who: 'gafoop', name: 'STAPLER', max: 6,
    lines: [
      ['STAPLES THE NEAREST MONSTER', 'FROM A DISTANCE'],
      ['TWO STAPLES AT A TIME', ''], ['STAPLES GO THROUGH ONE', ''], ['THREE STAPLES AT A TIME', ''], ['STAPLES GO THROUGH TWO', ''], ['FOUR STAPLES, HARDER', ''],
    ],
  },
  shredder: {
    id: 'shredder', kind: 'armament', who: 'gafoop', name: 'PAPER SHREDDER', max: 6,
    lines: [
      ['A BLADE CIRCLES GAFOOP', 'SHREDDING WHAT IT TOUCHES'],
      ['TWO BLADES', ''], ['WIDER AND HARDER', ''], ['THREE BLADES', ''], ['WIDER AND HARDER', ''], ['FOUR BLADES', ''],
    ],
  },
  crook: {
    id: 'crook', kind: 'armament', who: 'gafoop', name: 'HERDING CROOK', max: 6,
    lines: [
      ['SWEEPS AHEAD OF GAFOOP', 'AND HOOKS CARRIED SHEEP FREE'],
      ['HARDER, LONGER', ''], ['HARDER, SOONER', ''], ['HARDER, LONGER', ''], ['HARDER, SOONER', ''], ['SWEEPS HALF WAY ROUND', ''],
    ],
  },
  bells: {
    id: 'bells', kind: 'armament', who: 'flock', name: 'BELL COLLARS', max: 6,
    lines: [
      ['3 SHEEP WEAR BELLS THAT RING', 'OUT A SHOCKWAVE NOW AND THEN'],
      ['6 SHEEP WEAR BELLS', ''], ['10 SHEEP, LOUDER', ''], ['15 SHEEP WEAR BELLS', ''], ['22 SHEEP, LOUDER', ''], ['EVERY SHEEP WEARS A BELL', ''],
    ],
  },
  static: {
    id: 'static', kind: 'armament', who: 'flock', name: 'STATIC WOOL', max: 6,
    lines: [
      ['LIGHTNING ARCS BETWEEN SHEEP', 'THAT STAND CLOSE TOGETHER'],
      ['MORE ARCS', ''], ['MORE ARCS, HARDER', ''], ['MORE ARCS, SOONER', ''], ['MORE ARCS, HARDER', ''], ['A STORM OF ARCS', ''],
    ],
  },
  disc: {
    id: 'disc', kind: 'provision', who: 'gafoop', name: 'TURBO DISC', max: 4,
    lines: [['GAFOOP FLIES 10% FASTER', ''], ['20% FASTER', ''], ['30% FASTER', ''], ['40% FASTER', '']],
  },
  shears: {
    id: 'shears', kind: 'provision', who: 'gafoop', name: 'LONG SHEARS', max: 4,
    lines: [['PICKS UP AND SHEARS', 'FROM FURTHER AWAY'], ['FURTHER STILL', ''], ['FURTHER STILL', ''], ['FURTHER STILL', '']],
  },
  medal: {
    id: 'medal', kind: 'provision', who: 'gafoop', name: 'MEDAL OF EXCESSIVE MERIT', max: 4,
    lines: [['EVERYTHING HITS 10% HARDER', ''], ['20% HARDER', ''], ['30% HARDER', ''], ['40% HARDER', '']],
  },
  expedite: {
    id: 'expedite', kind: 'provision', who: 'gafoop', name: 'EXPEDITED PROCESSING', max: 4,
    lines: [['EVERYTHING GOES OFF 8% SOONER', ''], ['16% SOONER', ''], ['24% SOONER', ''], ['32% SOONER', '']],
  },
  fleece: {
    id: 'fleece', kind: 'provision', who: 'flock', name: 'THICK FLEECE', max: 4,
    lines: [['SHEEP ARE CARRIED SLOWER, AND', 'THEIR WOOL CUSHIONS SOONER'], ['SLOWER STILL', ''], ['SLOWER STILL', ''], ['SLOWER STILL', '']],
  },
  merino: {
    id: 'merino', kind: 'provision', who: 'flock', name: 'MERINO GENES', max: 4,
    lines: [['WOOL GROWS 20% FASTER', 'MORE EXPERIENCE FROM THE FLOCK'], ['40% FASTER', ''], ['60% FASTER', ''], ['80% FASTER', '']],
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** What a card can be: an item's next level, or, once nothing is left, one of these. */
export type Extra = 'sheep' | 'snack' | 'salvage';
export const EXTRAS: Record<Extra, { name: string; lines: [string, string] }> = {
  sheep: { name: '+3 SHEEP', lines: ['THE BUREAU FINDS THREE', 'STRAYS AND SENDS THEM ROUND'] },
  snack: { name: 'BUREAU SNACK', lines: ['GAFOOP GETS HIS COMPOSURE BACK', ''] },
  salvage: { name: 'BAG OF SALVAGE', lines: ['A THIRD OF A LEVEL', 'OF EXPERIENCE'] },
};

export type Card = { item: ItemId; level: number } | { extra: Extra };

const pick = <T>(table: readonly T[], level: number): T => table[Math.max(0, Math.min(table.length - 1, level - 1))];

/** An armament's numbers at a level (1-based). */
export const STATS = {
  stamp: (l: number) => ({ cooldown: pick([2.0, 1.9, 1.8, 1.65, 1.5, 1.35], l), damage: pick([10, 13, 16, 19, 22, 27], l), radius: pick([2.3, 2.5, 2.7, 2.9, 3.1, 3.5], l), knock: 2 }),
  stapler: (l: number) => ({ cooldown: 1.1, count: pick([1, 2, 2, 3, 3, 4], l), damage: pick([6, 7, 8, 9, 10, 12], l), pierce: pick([0, 0, 1, 1, 2, 2], l), speed: 18, range: 11, life: 0.9 }),
  shredder: (l: number) => ({ blades: pick([1, 2, 2, 3, 3, 4], l), damage: pick([5, 6, 7, 8, 9, 10], l), radius: pick([1.9, 1.9, 2.1, 2.1, 2.3, 2.5], l), spin: 2.6, every: 0.4 }),
  crook: (l: number) => ({ cooldown: pick([1.6, 1.5, 1.4, 1.3, 1.2, 1.0], l), damage: pick([8, 10, 12, 14, 16, 20], l), range: pick([2.6, 2.8, 3.0, 3.2, 3.4, 3.8], l), arc: l >= 6 ? Math.PI : (Math.PI * 2) / 3, knock: 1.5 }),
  bells: (l: number) => ({ collars: pick([3, 6, 10, 15, 22, 999], l), every: 4, radius: pick([1.8, 1.9, 2.0, 2.2, 2.4, 2.6], l), damage: pick([6, 8, 10, 12, 14, 17], l), knock: 1 }),
  static: (l: number) => ({ cooldown: pick([1.0, 0.9, 0.8, 0.7, 0.65, 0.6], l), arcs: pick([2, 3, 4, 5, 6, 8], l), reach: 3.2, damage: pick([6, 7, 8, 10, 11, 13], l), width: 0.7 }),
};
