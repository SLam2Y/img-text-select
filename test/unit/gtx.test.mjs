import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gtxUrl, parseGtx } from '../../src/gtx.js';

test('url encodes text and target language', () => {
  const u = new URL(gtxUrl('a&b 你好', 'ru'));
  assert.equal(u.origin + u.pathname, 'https://translate.googleapis.com/translate_a/single');
  assert.equal(u.searchParams.get('q'), 'a&b 你好');
  assert.equal(u.searchParams.get('tl'), 'ru');
  assert.equal(u.searchParams.get('sl'), 'auto');
  assert.equal(u.searchParams.get('client'), 'gtx');
  assert.equal(u.searchParams.get('dt'), 't');
});

test('joins segments and skips transliteration', () => {
  const json = [[['Привет ', 'Hello ', null, null, 10], ['мир', 'world', null, null, 10], [null, null, 'Privet mir']], null, 'en'];
  assert.equal(parseGtx(json), 'Привет мир');
});
