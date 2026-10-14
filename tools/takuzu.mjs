/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../takuzu/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'SIZES', 'EMPTY', 'DIFFICULTIES', 'rng', 'linesOf', 'validLines', 'allPlacements', 'solveLogically', 'isFull', 'conflicts',
  'fillGrid', 'carve', 'generate', 'cycle', 'serialize', 'deserialize', 'freshState', 'bestKey', 'deserializeBest'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
