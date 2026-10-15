/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../nonogram/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'SIZES', 'UNKNOWN', 'FILL', 'CROSS', 'EMPTY', 'MAX_FLIPS', 'EMOJI', 'rng', 'linesOf', 'runs', 'cluesOf', 'solveLine', 'solve',
  'isFull', 'nextStep', 'brokenLines', 'doneLines', 'isSolved', 'levelsOf', 'mirror', 'cutoffAt', 'naturalCutoff', 'thresholdAt', 'readsWell',
  'repair', 'solutionOf', 'nextPuzzle', 'serialize', 'deserialize', 'deserializeDecks', 'freshState'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
