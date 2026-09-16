/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

/* The grid size changes per puzzle, so these are read live rather than
 * captured once when the script is evaluated. */
const LIVE = ['COLS', 'ROWS', 'CELLS', 'KING', 'ORTH'];
const EXPORTS = [
  'MAXD', 'DIFFICULTIES', 'SINGLES_ONLY', 'bit', 'redBit', 'cellRed', 'NOTES_MAX', 'bitCount',
  'bitsOf', 'buildLayout', 'partition', 'candidateMask', 'conflicts', 'searchSolutions',
  'nakedSubsets', 'pointing', 'nextPlacement', 'allPlacements', 'findFilledLayout', 'solveLogically', 'carve',
  'generate', 'applyDigit', 'serialize', 'deserialize', 'freshState', 'shuffle', 'range',
  'SIZES', 'DEFAULT_SIZE', 'setGeometry', 'isOfferedSize'
];

const body = [...LIVE.map((name) => `get ${name}() { return ${name}; }`), ...EXPORTS].join(', ');
const factory = new Function(`${match[1]}\nreturn { ${body} };`);
export default factory();
export const source = match[1];
export const file = fileURLToPath(new URL('../index.html', import.meta.url));
