/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../flappy/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'WIDTH', 'HEIGHT', 'GROUND', 'BIRD_X', 'BIRD_R', 'FLAP', 'MAX_FALL', 'SPEED', 'PIPE_W', 'GAP', 'SPACING', 'JITTER', 'SHIFT',
  'GAP_LOW', 'GAP_HIGH', 'FIRST', 'rng', 'nextSpacing', 'nextGap', 'newWorld', 'flap', 'hitsPipe', 'advance', 'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
