/* Writes the list of emoji that Nonogram makes pictures from into
 * nonogram/index.html, from the Unicode and CLDR data on this machine: every single
 * code point emoji, without the parts that only build other emoji (skin
 * tones, flag letters, keycap digits). The game itself throws out the ones
 * that do not make a good picture. Run it again to pick up new emoji. */
import { readFileSync, writeFileSync } from 'node:fs';

const UCD = process.env.UCD || '/usr/share/unicode/ucd';
const CLDR = process.env.CLDR || '/usr/share/unicode/cldr';
const PAGE = new URL('../nonogram/index.html', import.meta.url);

/* Code points by property, from emoji-data.txt. */
function properties() {
  const out = {};
  for (const line of readFileSync(`${UCD}/emoji/emoji-data.txt`, 'utf8').split('\n')) {
    const data = line.split('#')[0].trim();
    if (!data) continue;
    const [span, property] = data.split(';').map((s) => s.trim());
    const [from, to] = span.split('..').map((h) => parseInt(h, 16));
    out[property] = out[property] || new Set();
    for (let cp = from; cp <= (to ?? from); cp++) out[property].add(cp);
  }
  return out;
}

/* The names emoji go by, such as 'red heart', from CLDR; the Unicode
 * character names are older, and say 'heavy black heart' for the same. */
function emojiNames() {
  const out = new Map();
  const xml = readFileSync(`${CLDR}/common/annotations/en.xml`, 'utf8');
  for (const [, cp, name] of xml.matchAll(/<annotation cp="([^"]+)" type="tts">([^<]+)<\/annotation>/g)) {
    const text = name.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    if ([...cp].length === 1) out.set(cp.codePointAt(0), text);
  }
  return out;
}

function names() {
  const out = new Map();
  for (const line of readFileSync(`${UCD}/UnicodeData.txt`, 'utf8').split('\n')) {
    const [hex, name] = line.split(';');
    if (name && !name.startsWith('<')) out.set(parseInt(hex, 16), name.toLowerCase());
  }
  return out;
}

const props = properties();
const unicodeNames = names();
const cldrNames = emojiNames();
const nameOf = new Map([...unicodeNames, ...cldrNames]);
const lines = [...props.Emoji]
  .filter((cp) => !props.Emoji_Component.has(cp) && nameOf.has(cp))
  .sort((a, b) => a - b)
  /* Emoji that show as text by default are asked to show as emoji. */
  .map((cp) => String.fromCodePoint(cp) + (props.Emoji_Presentation.has(cp) ? '' : '\uFE0F') + ' ' + nameOf.get(cp));

const html = readFileSync(PAGE, 'utf8');
const pattern = /(var EMOJI_LIST = `\n)[\s\S]*?(\n`;)/;
if (!pattern.test(html)) throw new Error('could not find EMOJI_LIST in nonogram/index.html');
writeFileSync(PAGE, html.replace(pattern, (_, open, close) => open + lines.join('\n') + close));
console.log(`${lines.length} emoji`);
