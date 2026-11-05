import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLines } from '../../src/lines.js';

const r = (text, x, y, width, height, confidence = 0.9) => ({ text, confidence, box: { x, y, width, height } });

test('drops empty and low-confidence results, trims text', () => {
  const lines = toLines([r('  hi ', 0, 0, 40, 10), r('   ', 0, 20, 40, 10), r('noise', 0, 40, 40, 10, 0.3)]);
  assert.deepEqual(lines.map(l => l.text), ['hi']);
});

test('horizontal text reads top-to-bottom, left-to-right within a row', () => {
  const lines = toLines([r('below', 0, 30, 50, 12), r('right', 100, 2, 50, 12), r('left', 0, 0, 50, 12)]);
  assert.deepEqual(lines.map(l => l.text), ['left', 'right', 'below']);
  assert.equal(lines[0].vertical, false);
});

test('vertical columns read right-to-left, top-to-bottom', () => {
  const lines = toLines([r('左列', 0, 0, 20, 100), r('右列', 50, 0, 20, 100), r('右下', 52, 120, 20, 60)]);
  assert.deepEqual(lines.map(l => l.text), ['右列', '右下', '左列']);
  assert.ok(lines.every(l => l.vertical));
});

test('single tall glyph is not vertical', () => {
  assert.equal(toLines([r('I', 0, 0, 5, 30)])[0].vertical, false);
});

test('keeps geometry in source pixels', () => {
  assert.deepEqual(toLines([r('a b', 3, 4, 50, 12)])[0], { text: 'a b', x: 3, y: 4, w: 50, h: 12, vertical: false });
});
