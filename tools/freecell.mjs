/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../freecell/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'SUITS', 'RANKS', 'DEALS', 'UNSOLVABLE', 'CELL', 'HOME', 'rankOf', 'suitOf', 'isRed', 'fits', 'isRun',
  'deal', 'randomDeal', 'cardsOf', 'capacity', 'canMove', 'move', 'bestMove', 'isSafe', 'homeMove', 'isWon', 'canFinish',
  'rng', 'isState', 'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
