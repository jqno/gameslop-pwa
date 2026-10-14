/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../breakout/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'WIDTH', 'HEIGHT', 'COLS', 'MAX_ROWS', 'TOP', 'BRICK_H', 'PADDLE_Y', 'PADDLE_W', 'RADIUS', 'MAX_ANGLE',
  'FIRST_SPEED', 'MAX_SPEED', 'rng', 'speedFor', 'layout', 'clampPaddle', 'bounce', 'serve', 'newWorld',
  'brickAt', 'strike', 'advance', 'isCleared', 'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
