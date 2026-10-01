/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../gems/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'SIZE', 'COLOURS', 'TARGETS', 'POINTS', 'BONUS', 'rng', 'findLines', 'findMatches', 'isAdjacent', 'swap',
  'isValidMove', 'findMoves', 'hasMove', 'newBoard', 'reshuffle', 'collapse', 'resolve', 'waveScore',
  'bestKey', 'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
