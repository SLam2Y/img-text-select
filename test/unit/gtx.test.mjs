import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gtxUrl, parseGtx, joinLines } from '../../src/gtx.js';

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

test('joinLines merges wrapped lines into one sentence', () => {
  assert.equal(joinLines('What matters\nis that you\nwin today!'), 'What matters is that you win today!');
});

test('joinLines glues hyphenated wraps and CJK without spaces', () => {
  assert.equal(joinLines('com-\nplete'), 'complete');
  assert.equal(joinLines('今日は\nいい天気'), '今日はいい天気');
  assert.equal(joinLines('안녕하세요\n세계'), '안녕하세요 세계');
});

test('joinLines turns ALL CAPS lettering into sentence case', () => {
  assert.equal(joinLines("I THINK SO.\nYOU'RE LATE! WHY?"), "I think so. You're late! Why?");
  assert.equal(joinLines('Mixed Case Stays'), 'Mixed Case Stays');
});
