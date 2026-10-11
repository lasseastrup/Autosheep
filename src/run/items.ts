/**
 * What level-ups offer (plan §8.6): three kinds of item, for Gafoop, for the flock or for the
 * shearing booths.
 *
 * - **Armaments** work by themselves and do damage: Gafoop's stationery, and gear the flock
 *   wears (the clockwork collie among it). Five slots, to level 6.
 * - **The usable** is the one item the player works, with the one button: held (the feed
 *   bucket) or tapped, then ready again after a cooldown. One at a time; a card for another one
 *   swaps it. To level 4.
 * - **Provisions** are passive: faster, harder, wider, woollier, and the shearing drone. Five
 *   slots, to level 4.
 */
export type ItemKind = 'armament' | 'usable' | 'provision';

export type ItemId =
  // armaments
  | 'stamp' | 'stapler' | 'shredder' | 'crook' | 'planes' | 'tape' | 'punch' | 'cabinet'
  | 'bells' | 'static' | 'rams' | 'tags' | 'flak' | 'collie'
  // usables
  | 'bucket' | 'whistle' | 'woof' | 'lick' | 'decoys' | 'hurdle' | 'beam'
  // provisions
  | 'disc' | 'medal' | 'expedite' | 'triplicate' | 'cap' | 'composure' | 'vacuum' | 'expense'
  | 'shears' | 'drone' | 'fleece' | 'merino' | 'calm' | 'lambs' | 'stubborn' | 'homing';

export interface ItemDef {
  id: ItemId;
  kind: ItemKind;
  /** who it is for: Gafoop, the flock, or the shearing booths */
  who: 'gafoop' | 'flock' | 'booths';
  name: string;
  max: number;
  /** the card's two lines: what it does when new, then what each next level adds */
  lines: [string, string][];
  /** a usable that works while the button is held (the bucket), rather than tapped */
  hold?: boolean;
  /** a usable's name on its button */
  button?: string;
}

export const SLOTS: Record<ItemKind, number> = { armament: 5, usable: 1, provision: 5 };

type Def = Omit<ItemDef, 'id'>;
const arm = (who: ItemDef['who'], name: string, lines: [string, string][]): Def => ({ kind: 'armament', who, name, max: 6, lines });
const use = (who: ItemDef['who'], name: string, button: string, lines: [string, string][], hold = false): Def => ({ kind: 'usable', who, name, max: 4, lines, button, hold });
const prov = (who: ItemDef['who'], name: string, lines: [string, string][]): Def => ({ kind: 'provision', who, name, max: 4, lines });
/** later levels' cards: one line each */
const more = (...s: string[]): [string, string][] => s.map((l) => [l, ''] as [string, string]);

const DEFS: Record<ItemId, Def> = {
  // ---- armaments: Gafoop's stationery
  stamp: arm('gafoop', 'RUBBER STAMP', [['SLAMS APPROVED ALL ROUND GAFOOP', 'HITS EVERYTHING CLOSE, KNOCKS IT BACK'], ...more('HARDER AND WIDER', 'HARDER, WIDER, SOONER', 'HARDER AND WIDER', 'HARDER, WIDER, SOONER', 'A MUCH BIGGER STAMP')]),
  stapler: arm('gafoop', 'STAPLER', [['STAPLES THE NEAREST MONSTER', 'FROM A DISTANCE'], ...more('TWO STAPLES AT A TIME', 'STAPLES GO THROUGH ONE', 'THREE STAPLES AT A TIME', 'STAPLES GO THROUGH TWO', 'FOUR STAPLES, HARDER')]),
  shredder: arm('gafoop', 'PAPER SHREDDER', [['A BLADE CIRCLES GAFOOP', 'SHREDDING WHAT IT TOUCHES'], ...more('TWO BLADES', 'WIDER AND HARDER', 'THREE BLADES', 'WIDER AND HARDER', 'FOUR BLADES')]),
  crook: arm('gafoop', 'HERDING CROOK', [['SWEEPS AHEAD OF GAFOOP', 'AND HOOKS CARRIED SHEEP FREE'], ...more('HARDER, LONGER', 'HARDER, SOONER', 'HARDER, LONGER', 'HARDER, SOONER', 'SWEEPS HALF WAY ROUND')]),
  planes: arm('gafoop', 'PAPER PLANES', [['FOLDED FORMS HOME IN ON THE', 'MONSTER NEAREST TO A SHEEP'], ...more('FASTER AND HARDER', 'TWO PLANES', 'PLANES GO THROUGH ONE', 'THREE PLANES', 'FOUR PLANES, HARDER')]),
  tape: arm('gafoop', 'RED TAPE', [['GAFOOP TRAILS RED TAPE: WHAT', 'CROSSES IT IS SLOWED AND HURT'], ...more('LONGER TAPE', 'STICKIER, AND IT HURTS MORE', 'LONGER TAPE', 'STICKIER, AND IT HURTS MORE', 'MONSTERS ARE STUCK FAST')]),
  punch: arm('gafoop', 'HOLE PUNCH', [['PUNCHES THE TOUGHEST MONSTER', 'IN REACH, VERY HARD'], ...more('HARDER', 'HARDER, SOONER', 'FURTHER, HARDER', 'HARDER, SOONER', 'TWO HOLES AT A TIME')]),
  cabinet: arm('gafoop', 'FILING CABINET', [['BLORP DROPS A CABINET FROM', 'ORBIT ON THE THICKEST CROWD'], ...more('HEAVIER', 'SOONER AND WIDER', 'TWO CABINETS', 'HEAVIER AND WIDER', 'THREE CABINETS')]),
  // ---- armaments: gear the flock wears
  bells: arm('flock', 'BELL COLLARS', [['3 SHEEP WEAR BELLS THAT RING', 'OUT A SHOCKWAVE NOW AND THEN'], ...more('6 SHEEP WEAR BELLS', '10 SHEEP, LOUDER', '15 SHEEP WEAR BELLS', '22 SHEEP, LOUDER', 'EVERY SHEEP WEARS A BELL')]),
  static: arm('flock', 'STATIC WOOL', [['LIGHTNING ARCS BETWEEN SHEEP', 'THAT STAND CLOSE TOGETHER'], ...more('MORE ARCS', 'MORE ARCS, HARDER', 'MORE ARCS, SOONER', 'MORE ARCS, HARDER', 'A STORM OF ARCS')]),
  rams: arm('flock', 'RAM HORNS', [['2 SHEEP GROW HORNS AND BUTT', 'WHATEVER COMES TOO CLOSE'], ...more('3 RAMS', '5 RAMS, HARDER', '7 RAMS', '10 RAMS, HARDER', '14 RAMS, AND THEY BUTT SOONER')]),
  tags: arm('flock', 'EAR-TAG ZAPPERS', [['TAGGED SHEEP ZAP ANYTHING', 'THAT GRABS THEM'], ...more('HARDER', 'HARDER, SOONER', 'A ZAP MAY DEPORT THE GRABBER', 'DEPORTS MORE OFTEN', 'DEPORTS MOST OF THE TIME')]),
  flak: arm('flock', 'FLEECE FLAK', [['TORN FLEECES BURST, AND SHEEP', 'IN A PANIC SHED TUFTS THAT POP'], ...more('BIGGER BURSTS', 'HARDER', 'MORE TUFTS', 'BIGGER AND HARDER', 'EVERY STAMPEDE IS A BARRAGE')]),
  collie: arm('flock', 'CLOCKWORK COLLIE', [['A BRASS DOG CIRCLES THE FLOCK', 'BITING MONSTERS, BUNCHING SHEEP'], ...more('BITES HARDER', 'FASTER AND HARDER', 'A SECOND COLLIE', 'FASTER AND HARDER', 'THEY BITE MUCH HARDER')]),
  // ---- usables: one at a time, on the button
  bucket: use('gafoop', 'FEED BUCKET', 'BUCKET', [['HOLD IT: THE FLOCK COMES TO', 'GAFOOP, AND FOLLOWS HIM'], ...more('CALLS FROM FURTHER', 'FURTHER, AND THEY HURRY', 'CALLS FROM HALF THE FIELD')], true),
  whistle: use('gafoop', 'DOG WHISTLE', 'WHISTLE', [['BLOW IT: THE WHOLE FLOCK RUNS', 'BACK TOGETHER'], ...more('READY SOONER', 'SOONER, AND HEARD FURTHER', 'HEARD FROM ANYWHERE')]),
  woof: use('gafoop', 'WOOF-WOOF 3000', 'WOOF', [['BARK: MONSTERS ARE BLOWN BACK', 'AND LET GO (THE SHEEP JUMP TOO)'], ...more('WIDER, SOONER', 'TRAINED: THE SHEEP STAY CALM', 'WIDER, SOONER, DIZZIER')]),
  lick: use('flock', 'SALT LICK', 'LICK', [['DROP A SALT LICK: THE FLOCK', 'GATHERS ROUND, GROWS WOOL'], ...more('LASTS LONGER', 'SOONER, AND MORE WOOL', 'TWO LICKS AT ONCE')]),
  decoys: use('flock', 'INFLATABLE SHEEP', 'DECOY', [['DROP A DECOY SHEEP: GLOOPS GO', 'FOR IT FIRST, AND IT BURSTS'], ...more('3 AT A TIME', 'A BIGGER BANG', '5 AT A TIME')]),
  hurdle: use('gafoop', 'PORTABLE HURDLE', 'HURDLE', [['DROP A HURDLE ACROSS YOUR WAY:', 'NO SHEEP OR GLOOP GETS THROUGH'], ...more('LONGER, AND IT LASTS LONGER', 'TWO AT ONCE', 'ELECTRIFIED')]),
  beam: use('gafoop', 'TRACTOR BEAM', 'BEAM', [['BLORP BEAMS A TAKEN SHEEP OR', 'A STRAGGLER BACK TO THE FLOCK'], ...more('READY SOONER, REACHES FURTHER', 'SOONER STILL', 'TWO SHEEP AT A TIME')]),
  // ---- provisions: Gafoop
  disc: prov('gafoop', 'TURBO DISC', more('GAFOOP FLIES 10% FASTER', '20% FASTER', '30% FASTER', '40% FASTER')),
  medal: prov('gafoop', 'MEDAL OF EXCESSIVE MERIT', more('EVERYTHING HITS 10% HARDER', '20% HARDER', '30% HARDER', '40% HARDER')),
  expedite: prov('gafoop', 'EXPEDITED PROCESSING', more('EVERYTHING GOES OFF 8% SOONER', '16% SOONER', '24% SOONER', '32% SOONER')),
  triplicate: prov('gafoop', 'TRIPLICATE', [['ONE MORE OF EVERYTHING FIRED:', 'STAPLES, PLANES, CABINETS, ARCS'], ...more('TWO MORE', 'THREE MORE', 'FOUR MORE')]),
  cap: prov('gafoop', 'BIGGER CAP', more('EVERYTHING HITS 12% WIDER', '24% WIDER', '36% WIDER', '48% WIDER')),
  composure: prov('gafoop', 'COMPOSURE TRAINING', [['ONE MORE PIP OF COMPOSURE,', 'AND THEY COME BACK SOONER'], ...more('TWO MORE PIPS', 'THREE MORE PIPS', 'FOUR MORE PIPS')]),
  vacuum: prov('gafoop', 'VACUUM ATTACHMENT', more('PICKS THINGS UP FROM 50% FURTHER', 'TWICE AS FAR', '2.5 TIMES AS FAR', 'THREE TIMES AS FAR')),
  expense: prov('gafoop', 'EXPENSE ACCOUNT', [['10% MORE EXPERIENCE', 'FROM EVERYTHING'], ...more('20% MORE', '30% MORE', '40% MORE')]),
  // ---- provisions: the booths and the flock
  shears: prov('booths', 'ELECTRIC SHEARS', [['BOOTHS AND DRONES SHEAR', '30% FASTER'], ...more('60% FASTER', '90% FASTER', '120% FASTER')]),
  drone: prov('booths', 'SHEARING DRONE', [['A BUREAU DRONE SHEARS FULL', 'FLEECES IN THE FLOCK, SLOWLY'], ...more('FASTER', 'FASTER STILL', 'A SECOND DRONE')]),
  fleece: prov('flock', 'THICK FLEECE', [['SHEEP ARE CARRIED SLOWER, AND', 'THEIR WOOL CUSHIONS SOONER'], ...more('SLOWER STILL', 'SLOWER STILL', 'SLOWER STILL')]),
  merino: prov('flock', 'MERINO GENES', [['WOOL GROWS 20% FASTER', 'MORE EXPERIENCE FROM THE FLOCK'], ...more('40% FASTER', '60% FASTER', '80% FASTER')]),
  calm: prov('flock', 'CALM DISPOSITION', [['FRIGHT SLOWS THE WOOL', 'A QUARTER LESS'], ...more('HALF AS MUCH', 'THREE QUARTERS LESS', 'FRIGHT COSTS NO WOOL AT ALL')]),
  lambs: prov('flock', 'LAMBING SEASON', [['A CALM FLOCK HAS A LAMB', 'EVERY HALF MINUTE'], ...more('A LAMB EVERY 24 S', 'EVERY 19 S', 'EVERY 15 S')]),
  stubborn: prov('flock', 'STUBBORN BREED', [['A GRABBED SHEEP MAY KICK', 'ITSELF FREE'], ...more('KICKS FREE MORE OFTEN', 'MORE OFTEN STILL', 'HARDLY EVER STAYS GRABBED')]),
  homing: prov('flock', 'HOMING INSTINCT', [['STRAYS JOIN THE FLOCK FROM', 'FURTHER AWAY'], ...more('FURTHER STILL', 'FURTHER STILL', 'FROM ACROSS THE FIELD')]),
};

export const ITEMS = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, { id, ...d }])) as Record<ItemId, ItemDef>;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** What a card can be: an item's next level, or, once nothing is left, one of these. */
export type Extra = 'sheep' | 'snack' | 'salvage';
export const EXTRAS: Record<Extra, { name: string; lines: [string, string] }> = {
  sheep: { name: '+3 SHEEP', lines: ['THE BUREAU FINDS THREE', 'STRAYS AND SENDS THEM ROUND'] },
  snack: { name: 'BUREAU SNACK', lines: ['GAFOOP GETS HIS COMPOSURE BACK', ''] },
  salvage: { name: 'BAG OF SALVAGE', lines: ['A THIRD OF A LEVEL', 'OF EXPERIENCE'] },
};

/** A card: an item's next level (`swap`: the usable it would replace), or an extra. */
export type Card = { item: ItemId; level: number; swap?: ItemId } | { extra: Extra };

const pick = <T>(table: readonly T[], level: number): T => table[Math.max(0, Math.min(table.length - 1, level - 1))];

/** An armament's or tool's numbers at a level (1-based). Times in seconds, lengths in metres. */
export const STATS = {
  stamp: (l: number) => ({ cooldown: pick([1.5, 1.45, 1.4, 1.3, 1.2, 1.1], l), damage: pick([10, 13, 16, 19, 22, 27], l), radius: pick([2.6, 2.8, 3.0, 3.2, 3.4, 3.8], l), knock: 2 }),
  stapler: (l: number) => ({ cooldown: 1.1, count: pick([1, 2, 2, 3, 3, 4], l), damage: pick([6, 7, 8, 9, 10, 12], l), pierce: pick([0, 0, 1, 1, 2, 2], l), speed: 18, range: 11, life: 0.9 }),
  shredder: (l: number) => ({ blades: pick([1, 2, 2, 3, 3, 4], l), damage: pick([5, 6, 7, 8, 9, 10], l), radius: pick([1.9, 1.9, 2.1, 2.1, 2.3, 2.5], l), spin: 2.6, every: 0.4 }),
  crook: (l: number) => ({ cooldown: pick([1.6, 1.5, 1.4, 1.3, 1.2, 1.0], l), damage: pick([8, 10, 12, 14, 16, 20], l), range: pick([2.6, 2.8, 3.0, 3.2, 3.4, 3.8], l), arc: l >= 6 ? Math.PI : (Math.PI * 2) / 3, knock: 1.5 }),
  planes: (l: number) => ({ cooldown: pick([2.2, 2.0, 1.9, 1.8, 1.6, 1.4], l), count: pick([1, 1, 2, 2, 3, 4], l), damage: pick([9, 12, 13, 15, 17, 20], l), pierce: l >= 4 ? 1 : 0, speed: pick([8, 9.5, 9.5, 10, 10, 11], l), turn: 5, life: 3.5 }),
  tape: (l: number) => ({ life: pick([3, 4, 4, 5, 5, 6], l), slow: pick([0.6, 0.6, 0.45, 0.45, 0.3, 0.1], l), dps: pick([4, 5, 7, 8, 10, 13], l), every: 0.5, reach: 0.5 }),
  punch: (l: number) => ({ cooldown: pick([2.4, 2.3, 2.0, 2.0, 1.7, 1.6], l), damage: pick([30, 40, 50, 60, 75, 95], l), range: pick([7, 7, 7.5, 9, 9, 10], l), count: l >= 6 ? 2 : 1 }),
  cabinet: (l: number) => ({ cooldown: pick([7, 6.5, 6, 6, 5.5, 5], l), count: pick([1, 1, 1, 2, 2, 3], l), damage: pick([40, 55, 60, 70, 90, 110], l), radius: pick([2.2, 2.2, 2.6, 2.6, 3.0, 3.2], l), fall: 0.8, range: 20 }),
  bells: (l: number) => ({ collars: pick([3, 6, 10, 15, 22, 999], l), every: 4, radius: pick([1.8, 1.9, 2.0, 2.2, 2.4, 2.6], l), damage: pick([6, 8, 10, 12, 14, 17], l), knock: 1 }),
  static: (l: number) => ({ cooldown: pick([1.0, 0.9, 0.8, 0.7, 0.65, 0.6], l), arcs: pick([2, 3, 4, 5, 6, 8], l), reach: 3.2, damage: pick([6, 7, 8, 10, 11, 13], l), width: 0.7 }),
  rams: (l: number) => ({ rams: pick([2, 3, 5, 7, 10, 14], l), every: pick([1.6, 1.6, 1.5, 1.5, 1.3, 1.0], l), damage: pick([8, 10, 13, 15, 19, 24], l), reach: 1.4, knock: 3 }),
  tags: (l: number) => ({ every: pick([0.8, 0.8, 0.65, 0.65, 0.6, 0.5], l), damage: pick([6, 8, 10, 12, 14, 18], l), deport: pick([0, 0, 0, 0.15, 0.25, 0.4], l) }),
  flak: (l: number) => ({ damage: pick([15, 18, 24, 26, 32, 40], l), radius: pick([2.2, 2.5, 2.5, 2.7, 3.0, 3.2], l), tufts: pick([1, 1, 2, 3, 4, 6], l), every: 1 }),
  collie: (l: number) => ({ collies: l >= 4 ? 2 : 1, speed: pick([7, 7, 8.5, 8.5, 9.5, 10], l), damage: pick([10, 14, 18, 18, 22, 28], l), every: 0.6, reach: 0.9, push: { strength: 0.45, radius: 4 } }),
  // usables: `cooldown` is how long after one use the next is ready
  bucket: (l: number) => ({ cooldown: 0, radius: pick([12, 15, 18, 26], l), strength: pick([1.0, 1.05, 1.2, 1.25], l) }),
  whistle: (l: number) => ({ cooldown: pick([12, 10, 8, 6], l), radius: pick([24, 28, 34, 60], l), lasts: 3, strength: 1.3 }),
  woof: (l: number) => ({ cooldown: pick([8, 7, 6, 5], l), radius: pick([5, 5.6, 6.2, 7], l), knock: pick([4.5, 5, 5.5, 6.5], l), dizzy: pick([1, 1, 1.3, 1.6], l), damage: 4, startle: l < 3 }),
  lick: (l: number) => ({ cooldown: pick([16, 14, 12, 10], l), lasts: pick([12, 15, 15, 18], l), radius: pick([10, 11, 12, 13], l), strength: 0.9, wool: pick([0.25, 0.25, 0.6, 0.75], l), count: l >= 4 ? 2 : 1 }),
  decoys: (l: number) => ({ cooldown: pick([7, 6, 5, 4], l), most: pick([2, 3, 3, 5], l), damage: pick([20, 26, 40, 45], l), radius: pick([2.5, 2.5, 3.0, 3.2], l), lasts: 20 }),
  hurdle: (l: number) => ({ cooldown: pick([8, 7, 6, 5], l), length: pick([4, 5.5, 5.5, 6.5], l), lasts: pick([15, 20, 20, 24], l), count: l >= 3 ? 2 : 1, shock: l >= 4 ? 8 : 0 }),
  beam: (l: number) => ({ cooldown: pick([20, 16, 13, 11], l), range: pick([16, 22, 26, 30], l), count: l >= 4 ? 2 : 1, straggler: 9 }),
  drone: (l: number) => ({ drones: l >= 4 ? 2 : 1, shear: pick([6, 5, 4, 4], l), least: 0.9, speed: 6 }),
};
