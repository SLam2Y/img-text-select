import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slices, inCore } from '../../src/slices.js';

const r = (text, y, height = 40) => ({ text, confidence: 0.9, box: { x: 10, y, width: 200, height } });

test('normal image is one slice', () => {
  assert.deepEqual(slices(900, 1200), [{ from: 0, to: 1200, top: 0, bottom: 1200 }]);
});

test('tall strip is cut into overlapping square slices', () => {
  const s = slices(900, 2000, 150);
  assert.deepEqual(s, [
    { from: 0, to: 900, top: 0, bottom: 1050 },
    { from: 900, to: 1800, top: 750, bottom: 1950 },
    { from: 1800, to: 2000, top: 1650, bottom: 2000 },
  ]);
});

test('inCore shifts to strip coords and keeps a boundary line exactly once', () => {
  const [a, b] = slices(900, 2000, 150);
  // line at strip y 880..920 (centre 900): slice a sees it at 880, slice b at 130
  const fromA = inCore([r('edge', 880), r('top', 100)], a);
  const fromB = inCore([r('edge', 130), r('cut at top', 0, 20)], b);
  assert.deepEqual(fromA.map(l => l.text), ['top']);
  assert.deepEqual(fromB.map(l => [l.text, l.box.y]), [['edge', 880]]);
});
