import { C, SKIN, HAIR, TOPS, PANTS } from './palette';
import { sprite, blit, type Grid } from './pix';

/* ============================================================
   PLAYERS — 16x16, facing right (towards the door).
   Head (rows 0-8) and body (rows 9-15) are separate grids so
   one body works with every hair style. Keys:
   k ink · s/S skin · h/H hair · t/T top · p/P pants · e eye · w paper
   ============================================================ */

const FACE_7 = '....kSssssssk...';
const FACE_8 = '.....kkkkkkk....';

export const HEADS: { name: string; rows: Grid }[] = [
  { name: 'SHORT', rows: ['................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...', '...khhhsssssk...', '...khHssssesk...', '...kHSssssesk...', FACE_7, FACE_8] },
  { name: 'SPIKY', rows: ['....k.k.k.k.....', '....khkhkhkk....', '....khhhhhhhk...', '...khhhhhhhhk...', '...khhhsssssk...', '...khHssssesk...', '...kHSssssesk...', FACE_7, FACE_8] },
  { name: 'AFRO', rows: ['....kkkkkkk.....', '...khhhhhhhk....', '..khhhhhhhhhk...', '..khhhhhhhhhhk..', '..khhhhsssssk...', '..khhHssssesk...', '...kHSssssesk...', FACE_7, FACE_8] },
  { name: 'CAP', rows: ['................', '.....kkkkkk.....', '....khhhhhhkkk..', '...khhhhhhhhhhk.', '...khhssssskkk..', '...khHssssesk...', '...kHSssssesk...', FACE_7, FACE_8] },
  { name: 'LONG', rows: ['................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...', '..khhhhsssssk...', '..khhHssssesk...', '..khhHSsssesk...', '..khhkSssssk....', '...kk.kkkkkk....'] },
  { name: 'BALD', rows: ['................', '.....kkkkkk.....', '....kswssssk....', '...kssssssssk...', '...kssssssssk...', '...kSsssssesk...', '...kSsssssesk...', FACE_7, FACE_8] },
  { name: 'BEANIE', rows: ['......kkk.......', '.....kkhkkk.....', '....khhhhhhk....', '...khhhhhhhhk...', '...kHHHHHHHHk...', '...kSsssssesk...', '...kSsssssesk...', FACE_7, FACE_8] },
  { name: 'MOHAWK', rows: ['.....kkk........', '....khhhk.......', '....khhhhkkk....', '...kkhhhhsssk...', '...kssssssssk...', '...kSsssssesk...', '...kSsssssesk...', FACE_7, FACE_8] },
];

const SHADES_ROW = 5;
const SHADES = '.......kgggk....';

type BodyName = 'stepA' | 'stepB' | 'up' | 'stand';
const BODIES: Record<BodyName, Grid> = {
  // sneak stride: hands reaching forward
  stepA: ['.....kTtttk.....', '....kTtttttsk...', '....kTttttkk....', '.....kpppPk.....', '....kpPkkppk....', '...kpPk..kppk...', '...kkk...kkkk...'],
  stepB: ['.....kTtttk.....', '....kTtttttsk...', '....kTttttkk....', '.....kpppPk.....', '.....kpPpk......', '.....kPkpk......', '.....kkkkkk.....'],
  up:    ['.....kTtttk.....', '....kTttttTk....', '....kTttttTk....', '.....kpppPk.....', '.....kpPpk......', '.....kpkpk......', '....kkk.kkk.....'],
  stand: ['.....kTtttk.....', '....kTttttTk....', '....kTtsttTk....', '.....kpppPk.....', '.....kpPpk......', '.....kpkpk......', '....kkk.kkk.....'],
};
const HANDS_UP: Grid = [
  '................', '................', '................', '................',
  '.kk..........kk.', 'kssk........kssk', '.kTk........kTk.', '.kTk........kTk.', '.kTk........kTk.', '..kTk......kTk..', '...kk......kk...',
];

export interface PlayerLook { head: number; hair: number; skin: number; top: number; pants: number; shades: 0 | 1 | 2 }

export function lookFromSeed(seed: number): PlayerLook {
  let a = (seed * 2654435761) >>> 0;
  const r = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return (a >>> 0) / 4294967296; };
  return {
    head: Math.floor(r() * HEADS.length),
    hair: Math.floor(r() * HAIR.length),
    skin: Math.floor(r() * SKIN.length),
    top: Math.floor(r() * TOPS.length),
    pants: Math.floor(r() * PANTS.length),
    shades: (r() < 0.55 ? 0 : r() < 0.7 ? 1 : 2) as PlayerLook['shades'],
  };
}

function playerMap(l: PlayerLook): Record<string, string> {
  return {
    k: C.INK, w: C.PAPER, e: C.INK,
    s: SKIN[l.skin][0], S: SKIN[l.skin][1],
    h: HAIR[l.hair][0], H: HAIR[l.hair][1],
    t: TOPS[l.top][0], T: TOPS[l.top][1],
    p: PANTS[l.pants][0], P: PANTS[l.pants][1],
    g: l.shades === 2 ? C.NEON : C.INK,
  };
}

export type PlayerFrame = 'stepA' | 'stepB' | 'freeze' | 'caught' | 'cheer' | 'stand' | 'sneakA' | 'sneakB';

/** A complete 16x16 player frame, cached per look+frame. */
export function playerSprite(l: PlayerLook, frame: PlayerFrame): HTMLCanvasElement {
  const key = `p${l.head}${l.hair}${l.skin}${l.top}${l.pants}${l.shades}${frame}`;
  const body: BodyName =
    frame === 'stepA' || frame === 'sneakA' || frame === 'freeze' ? 'stepA'
      : frame === 'stepB' || frame === 'sneakB' ? 'stepB'
        : frame === 'caught' || frame === 'cheer' ? 'up' : 'stand';
  const head = HEADS[l.head].rows.slice();
  if (l.shades) {
    const r = head[SHADES_ROW].split('');
    [...SHADES].forEach((ch, i) => { if (ch !== '.') r[i] = ch; });
    head[SHADES_ROW] = r.join('');
  }
  // crouch: head drops 1px for the sneak frames (the "tiptoe" read)
  const crouch = frame === 'sneakA' || frame === 'sneakB' || frame === 'freeze';
  let rows: Grid = crouch ? ['................', ...head.slice(0, 8), ...BODIES[body]] : [...head, ...BODIES[body]];
  if (frame === 'caught' || frame === 'cheer') {
    rows = rows.map((row, j) => {
      const o = HANDS_UP[j];
      if (!o) return row;
      const r = row.split('');
      [...o].forEach((ch, i) => { if (ch !== '.') r[i] = ch; });
      return r.join('');
    });
  }
  return sprite(key, rows, playerMap(l), 16);
}

/* ============================================================
   GUS — 24x28. Back = safe, tell = head turned + "!", front = watching.
   k ink · s/S skin · t/T shirt · p/P pants · o shoes · y gold · r lens · g phone glow
   ============================================================ */

const GUS_HEAD_BACK: Grid = [
  '........................',
  '........kkkkkkkk........',
  '.......kssssssssk.......',
  '......kssssssssssk......',
  '......kssssssssssk......',
  '......kSssssssssSk......',
  '......kSSssssssSSk......',
  '.......kkSSSSSSkk.......',
];
const GUS_HEAD_TURN: Grid = [
  '........................',
  '........kkkkkkkk........',
  '.......kssssssssk.......',
  '......kssssssssssk......',
  '.....kkkkkkssssssk......',
  '.....krrrrkSssssSk......',
  '......kssssssssSSk......',
  '.......kkSSSSSSkk.......',
];
const GUS_HEAD_FRONT: Grid = [
  '........................',
  '........kkkkkkkk........',
  '.......kssssssssk.......',
  '......kssssssssssk......',
  '......krrrrkkrrrrk......',
  '......kssssssssssk......',
  '......kSsskkkkssSk......',
  '.......kkSSSSSSkk.......',
];
const GUS_BODY_BACK: Grid = [
  '.....kkkkttttttkkkk.....',
  '...kkttttttttttttttkk...',
  '..kttttttttttttttttttk..',
  '..ktyyyyyyyyyyyyyyyytk..',
  '..kttttttttttttttttttk..',
  '..kTttttttttttttttttTk..',
  '..kTkttttttttttttttkTk..',
  '..kTkttttttttttttttkTk..',
  '..kTkTTTTTTTTTTTTTTkTk..',
  '..kskkkkkkkkkkkkkkkksk..',
];
const GUS_BODY_FRONT: Grid = [
  '.....kkkkttttttkkkk.....',
  '...kkttttttttttttttkk...',
  '..ktttttttttttttyttttk..',
  '..kttkkkkkkkkkkkkkkttk..',
  '..kttksssssssssssskttk..',
  '..kttkkkkkkkkkkkkkkttk..',
  '..kTttttttttttttttttTk..',
  '..kTttttttttttttttttTk..',
  '...kTTTTTTTTTTTTTTTTk...',
  '....kkkkkkkkkkkkkkkk....',
];
const GUS_LEGS: Grid = [
  '....kppppppppppppppk....',
  '....kppppppkkppppppk....',
  '....kppppppkkppppppk....',
  '....kppppppkkppppppk....',
  '....kPpppppkkPpppppk....',
  '....kPpppppkkPpppppk....',
  '...kooooooookkoooooook..',
  '...kkkkkkkkkkkkkkkkkkk..',
  '........................',
  '........................',
];
const GUS_PHONE: Grid = ['.', '.', '.', '...................gg...', '...................gg...', '..................kgg...'];
const GUS_ARM_POINT: Grid = ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', 'kkkkk...................', 'ssssttk.................', 'kkkkk...................'];
const GUS_ARMS_UP: Grid = ['.kk..................kk.', 'kssk................kssk', '.ktk................ktk.', '.ktk................ktk.', '.ktk................ktk.', '.ktk................ktk.', '..ktk..............ktk..', '...kk..............kk...'];

export type GusPose = 'back' | 'tell' | 'watch' | 'point' | 'sleep' | 'dance' | 'flattered';

function overlay(base: Grid, top: Grid, yOff = 0): Grid {
  return base.map((row, j) => {
    const o = top[j - yOff];
    if (!o || o === '.') return row;
    const r = row.split('');
    [...o].forEach((ch, i) => { if (ch !== '.') r[i] = ch; });
    return r.join('');
  });
}

export function gusSprite(pose: GusPose, lens: string = C.INK): HTMLCanvasElement {
  const map = {
    k: C.INK, s: '#9a6440', S: '#6e4228', t: C.ASPHALT, T: C.NIGHT, p: '#15121c', P: C.INK, o: C.INK,
    y: C.LAMP, r: lens, g: C.SAFE,
  };
  let rows: Grid;
  switch (pose) {
    case 'back': rows = overlay([...GUS_HEAD_BACK, ...GUS_BODY_BACK, ...GUS_LEGS], GUS_PHONE); break;
    case 'sleep': rows = [...['........................'], ...GUS_HEAD_BACK.slice(0, 7), ...GUS_BODY_BACK, ...GUS_LEGS]; break;
    case 'tell': rows = [...GUS_HEAD_TURN, ...GUS_BODY_BACK, ...GUS_LEGS]; break;
    case 'point': rows = overlay([...GUS_HEAD_FRONT, ...GUS_BODY_FRONT, ...GUS_LEGS], GUS_ARM_POINT); break;
    case 'dance': case 'flattered': rows = overlay([...GUS_HEAD_FRONT, ...GUS_BODY_FRONT, ...GUS_LEGS], GUS_ARMS_UP, 4); break;
    default: rows = [...GUS_HEAD_FRONT, ...GUS_BODY_FRONT, ...GUS_LEGS];
  }
  return sprite(`gus-${pose}-${lens}`, rows, map, 24);
}

/* ============================================================
   ICONS (hand-placed, 8 px grid)
   ============================================================ */

const BANG: Grid = ['..kkkk..', '.kyyyyk.', '.kyyyyk.', '.kyyyyk.', '..kyyk..', '..kyyk..', '...kk...', '..kyyk..', '..kyyk..', '...kk...'];
const QUESTION: Grid = ['.kkkkk..', 'kyyyyyk.', 'kykkkyk.', '.k.kyyk.', '..kyyk..', '..kyk...', '...k....', '..kyk...', '...k....'];
const SWEAT: Grid = ['.k..', 'kwk.', 'kwwk', 'kwwk', '.kk.'];
const PUFF: Grid = ['..kkkk..', '.kwwwwk.', 'kwwkwwwk', 'kwwwwwwk', 'kwwwwkwk', '.kwwwwk.', '..kkkk..'];
const COIN: Grid = ['.kkkk.', 'kyyyyk', 'kywyyk', 'kyyyLk', 'kyyyLk', '.kkkk.'];
const NOTE: Grid = ['...kkk', '...kyk', '...k.k', '...k.k', '.kkk.k', 'kyyk.k', 'kyyk..', '.kk...'];
const HEART: Grid = ['.kk.kk.', 'kvvkvvk', 'kvvvvvk', '.kvvvk.', '..kvk..', '...k...'];
const CAT_A: Grid = ['k...k...', 'kk.kk...', 'kkkkk...', 'kykyk...', 'kkkkk...', '.kkkkk..', '.kkkkk.k', '.kkkkkk.'];
const CAT_B: Grid = ['k...k...', 'kk.kk...', 'kkkkk...', 'kkkkk...', 'kkkkk...', '.kkkkk..', '.kkkkkk.', '.kkkkk.k'];
const STAR: Grid = ['...k...', '..kyk..', 'kkkykkk', '.kyyyk.', '..kyk..', '.kk.kk.'];

const iconMap = (y: string) => ({ k: C.INK, y, w: C.PAPER, L: C.LAMP_LO, v: C.VELVET });

export const icon = {
  bang: (color: string = C.LAMP) => sprite(`bang${color}`, BANG, iconMap(color)),
  question: () => sprite('q', QUESTION, iconMap(C.PAPER)),
  sweat: () => sprite('sweat', SWEAT, { k: C.INK, w: C.SAFE }),
  puff: () => sprite('puff', PUFF, iconMap(C.PAPER)),
  coin: () => sprite('coin', COIN, iconMap(C.LAMP)),
  note: (color: string = C.NEON) => sprite(`note${color}`, NOTE, iconMap(color)),
  heart: () => sprite('heart', HEART, iconMap(C.VELVET)),
  star: () => sprite('star', STAR, iconMap(C.LAMP)),
  cat: (blink: boolean) => sprite(blink ? 'catB' : 'catA', blink ? CAT_B : CAT_A, iconMap(C.LAMP)),
};

/** Draw a player with optional name tag and state icon. (x,y) = feet position. */
export function drawPlayer(ctx: CanvasRenderingContext2D, l: PlayerLook, frame: PlayerFrame, x: number, y: number, flip = false) {
  blit(ctx, playerSprite(l, frame), Math.round(x) - 8, Math.round(y) - 16, flip);
}
