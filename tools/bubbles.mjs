/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../bubbles/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'COLS', 'ROWS', 'H', 'WIDTH', 'SHOOTER', 'COLOURS', 'MODES', 'START_ROWS', 'POINTS', 'DROP', 'MAX_COMBO', 'rng',
  'emptyRow', 'centre', 'neighbours', 'occupied', 'cluster', 'floating', 'place', 'snap', 'trace',
  'insertRow', 'pushRow', 'lowerCeiling', 'newBoard', 'coloursOn', 'nextColour', 'isLost', 'isCleared',
  'shotsPerRow', 'scoreFor', 'bestKey', 'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
