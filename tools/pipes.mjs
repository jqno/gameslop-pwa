/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../pipes/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'LEVELS', 'MIN_PIPE', 'COLOURS', 'rng', 'neighbours', 'towards', 'isTight', 'tile', 'needsEveryCell', 'generate', 'newGame',
  'withPath', 'endAt', 'pathAt', 'isConnected', 'pickUp', 'extend', 'drawTo', 'filled', 'connectedCount', 'isSolved',
  'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
