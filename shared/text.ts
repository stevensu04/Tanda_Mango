/**
 * Text width rules shared by the server and both canvases. The pixel font draws A-Z/0-9 in one 6 px
 * cell and CJK (Chinese, Japanese, Korean) characters in two, so names are limited by cells, not
 * by characters: 12 cells is 12 letters or 6 Chinese characters.
 */
const WIDE_RE = /[ᄀ-ᅟ⺀-〿぀-꓏가-힣豈-﫿︰-﹏！-｠￠-￦\u{20000}-\u{3FFFD}]/u;
export const isWide = (ch: string) => WIDE_RE.test(ch);

export function cells(s: string): number {
  let n = 0;
  for (const ch of s) n += isWide(ch) ? 2 : 1;
  return n;
}

export const NAME_CELLS = 12;

/** Keep the first `max` cells of a string (never splits a wide character). */
export function cutCells(s: string, max: number): string {
  let out = '';
  let n = 0;
  for (const ch of s) {
    const w = isWide(ch) ? 2 : 1;
    if (n + w > max) break;
    out += ch;
    n += w;
  }
  return out;
}

/**
 * A player name as the game shows it: Latin letters in caps with accents folded (É -> E), digits,
 * Chinese/Japanese/Korean characters, spaces and . ' ! ? -. Everything else is dropped. Cut to
 * NAME_CELLS. Returns '' when nothing usable is left: callers fall back to a default nickname.
 */
export function cleanName(s: unknown): string {
  const t = String(s ?? '')
    .normalize('NFKC') // full-width ＡＢＣ -> ABC, ideographic space -> space
    .replace(/[À-ɏ]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .toUpperCase()
    .replace(/[^A-Z0-9 .'!?\-\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー々〆]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cutCells(t, NAME_CELLS).trim();
}

/** Two-digit player number: 3 -> "03". */
export const tagText = (n: number) => String(n).padStart(2, '0');

/** Fun default nicknames: the join page prefills one, and the server uses one when a name comes in blank. */
export const NICKNAMES = [
  'SNEAKY PETE', 'NOT A COP', 'DJ OYSTER', 'TOTALLY 21', 'VIP-ISH', 'TALL KEV', 'MRS. STEALTH', 'THE INTERN',
  'BOUNCY', 'PLUS ONE', 'DISCO NAP', 'GLOWSTICK', '不是警察', '舞池小霸王', '隱形人', '排隊達人', '夜貓子',
];
