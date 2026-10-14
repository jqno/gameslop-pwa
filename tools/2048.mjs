/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../2048/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'SIZE', 'WIN', 'FOUR_IN', 'DIRECTIONS', 'rng', 'linesFor', 'move', 'spawn', 'newBoard', 'canMove', 'hasWon',
  'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
