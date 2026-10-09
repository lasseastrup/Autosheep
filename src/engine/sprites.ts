import { C } from './palette';

/**
 * Hand-authored pixel sprites as character maps. Each character is a palette entry;
 * '.' is transparent. Rendered once to canvases and cached.
 */
const KEY: Record<string, string> = {
  k: C.ink, K: C.black, w: C.white, m: C.mist, f: C.fog, l: C.lilac,
  r: C.red, R: C.crimson, o: C.orange, a: C.amber, y: C.gold, Y: C.lemon,
  g: C.leaf, G: C.grass, d: C.pine, L: C.lime,
  b: C.sky, B: C.blue, c: C.skyLight, n: C.navy, i: C.ice, j: C.mint, J: C.teal,
  p: C.pink, P: C.peach, s: C.straw, t: C.tan, T: C.terracotta, u: C.rust, h: C.khaki,
  v: C.violet, V: C.plum, e: C.coal, x: C.clay, z: C.scarlet,
};

const SPRITES: Record<string, string[]> = {
  flame: [
    '.....k......',
    '....kok.....',
    '....koak....',
    '...koaok.k..',
    '..koaaaokok.',
    '..koayaaook.',
    '.koayYyaaok.',
    '.koayYYyaok.',
    '.koayYYyaok.',
    '..koayyaok..',
    '...kooook...',
    '....kkkk....',
  ],
  wheel: [
    '...kkkkkk...',
    '..khhhhhhk..',
    '.khhxhhxhhk.',
    'khhxkkkkxhhk',
    'khhkhhhhkhhk',
    'khxkhkkhkxhk',
    'khxkhkkhkxhk',
    'khhkhhhhkhhk',
    'khhxkkkkxhhk',
    '.khhxhhxhhk.',
    '..khhhhhhk..',
    '...kkkkkk...',
  ],
  ballot: [
    '....kkkk....',
    '....kwwk....',
    '....kwmk....',
    '.kkkkwwkkkk.',
    '.kffkkkkffk.',
    '.kmmmmmmmmk.',
    '.kmmmbbmmmk.',
    '.kmmbbbbmmk.',
    '.kmmmbbmmmk.',
    '.kmmmmmmmmk.',
    '.kffffffffk.',
    '.kkkkkkkkkk.',
  ],
  cat: [
    '.k........k.',
    'kak......kak',
    'kaak....kaak',
    'kaaakkkkaaak',
    'kaaaaaaaaaak',
    'kaakwaawkaak',
    'kaakkaakkaak',
    'kaaaaaaaaaak',
    'kwaaaapaaawk',
    '.kwaakkaawk.',
    '..kkaaaakk..',
    '....kkkk....',
  ],
  rocket: [
    '.....kk.....',
    '....kwwk....',
    '...kwmmwk...',
    '...kwccwk...',
    '...kwcbwk...',
    '...kwmmwk...',
    '..kzwmmwzk..',
    '.kzzwmmwzzk.',
    '.kzkwwwwkzk.',
    '.kk.koak.kk.',
    '....kyak....',
    '.....kk.....',
  ],
  atom: [
    '....kkkk....',
    '...kbk.kbk..',
    '.kkbk...kbkk',
    'kbbbkkkkkbbk',
    'kb.kbkkbk.bk',
    'kb.kkyykk.bk',
    'kb.kkyykk.bk',
    'kb.kbkkbk.bk',
    'kbbbkkkkkbbk',
    '.kkbk...kbkk',
    '...kbk.kbk..',
    '....kkkk....',
  ],
  burrito: [
    '............',
    '......kkkk..',
    '....kkssssk.',
    '...kssstsssk',
    '..ksstssssk.',
    '.kssssssstk.',
    'kgssstssssk.',
    'kgrsssssk...',
    'kyrgssskk...',
    '.kyrgkk.....',
    '..kkk.......',
    '............',
  ],
  fence: [
    '............',
    '.kk...kk...k',
    'kttk.kttk.kt',
    'kTtkkkTtkkkT',
    'kTtttttttttT',
    'kTtkkkTtkkkT',
    'kTtk.kTtk.kT',
    'kTtkkkTtkkkT',
    'kTtttttttttT',
    'kTtkkkTtkkkT',
    'kTtk.kTtk.kT',
    'kkkk.kkkk.kk',
  ],
  gate: [
    '............',
    'kk........kk',
    'kuk......kuk',
    'kukkkkkkkkuk',
    'kuttttttttuk',
    'kuktkttktkuk',
    'kukkttkkkkuk',
    'kuktkttktkuk',
    'kuttttttttuk',
    'kukkkkkkkkuk',
    'kuk......kuk',
    'kkk......kkk',
  ],
  // a brass robodog with a wind-up key: there are no real dogs left
  dog: [
    '.....kk.....',
    '....kyyk....',
    '.kk..kk..kk.',
    'kaak.kk.kaak',
    'kaaakkkkaaak',
    'kakckaakckak',
    'kaakkaakkaak',
    '.kaaaaaaaak.',
    '.kayaaaayak.',
    '..kakkkkak..',
    '..kaaaaaak..',
    '...kkkkkk...',
  ],
  gear: [
    '.....kk.....',
    '..kk.kfk.kk.',
    '..kfkkfkkfk.',
    '...kffffffk.',
    'kkkffkkkffkk',
    'kfffkk..kffk',
    'kfffk...kffk',
    'kkkffkkkfffk',
    '...kfffffkk.',
    '..kfkkfkkfk.',
    '..kk.kfk.kk.',
    '.....kk.....',
  ],
  check: [
    '..........kk',
    '.........kgk',
    '........kggk',
    '.......kggk.',
    'kk....kggk..',
    'kgk..kggk...',
    'kggkkggk....',
    '.kgggggk....',
    '..kgggk.....',
    '...kgk......',
    '....k.......',
    '............',
  ],
  sheep: [
    '............',
    '...kkkkkk...',
    '..kwwwwwwk..',
    '.kwwmwwwwwkk',
    'kwwwwwwwwkkk',
    'kwmwwwwwkkwk',
    'kwwwwwmwkkkk',
    '.kwwwwwwwkk.',
    '..kkkkkkkk..',
    '..kk.kk.kk..',
    '..kk.kk.kk..',
    '............',
  ],
  star: [
    '.....kk.....',
    '.....kyk....',
    '....kyyk....',
    'kkkkkyYkkkkk',
    'kyyyyYYyyyyk',
    '.kyyyYYyyyk.',
    '..kyyyyyyk..',
    '..kyyyyyyk..',
    '.kyyykkyyyk.',
    '.kyk....kyk.',
    'kk........kk',
    '............',
  ],
  stone: [
    '............',
    '....kkkk....',
    '..kkffffk...',
    '.kfmffffkk..',
    '.kffffflfk..',
    'kfmfffflfk..',
    'kffffffllfk.',
    'kfffflllllk.',
    '.kfflllllk..',
    '..kkkkkkk...',
    '............',
    '............',
  ],
  bronze: [
    '....kkkk....',
    '..kkTTTTkk..',
    '.kTtssttTTk.',
    '.kTsYsttTTk.',
    'kTtssttttTTk',
    'kTttttttTTTk',
    'kTTtttttTTuk',
    'kTTTttTTTTuk',
    '.kTTTTTTTuk.',
    '.kuTTTTTuuk.',
    '..kkuuuukk..',
    '....kkkk....',
  ],
  anvil: [
    '............',
    'kkkkkkkkkk..',
    'kmffffffffkk',
    '.kkfffffffk.',
    '...kkllllk..',
    '....kllk....',
    '....kllk....',
    '...klllllk..',
    '..kllllllllk',
    '..kkkkkkkkkk',
    '............',
    '............',
  ],
  chimney: [
    '...mmm......',
    '..mmmmm.....',
    '...mfm......',
    '...kkkk.....',
    '...kxuk.....',
    '...kuxk.....',
    '...kxuk..kk.',
    '.kkkuxkkkuk.',
    '.kxuxuxuxuk.',
    '.kuxkkkuxuk.',
    '.kxukykxuxk.',
    '.kkkkkkkkkk.',
  ],
};

const cache = new Map<string, HTMLCanvasElement>();

export function sprite(name: string): HTMLCanvasElement {
  let c = cache.get(name);
  if (c) return c;
  const rows = SPRITES[name];
  if (!rows) throw new Error(`no sprite ${name}`);
  c = document.createElement('canvas');
  c.width = Math.max(...rows.map((r) => r.length));
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = KEY[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(name, c);
  return c;
}

/** Draw a sprite at integer scale. */
export function drawSprite(g: CanvasRenderingContext2D, name: string, x: number, y: number, scale = 1): void {
  const s = sprite(name);
  g.imageSmoothingEnabled = false;
  g.drawImage(s, Math.round(x), Math.round(y), s.width * scale, s.height * scale);
}

export const SPRITE_NAMES = Object.keys(SPRITES);
