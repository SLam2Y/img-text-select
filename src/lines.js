// paddleocr.js RecognitionResult[] -> overlay lines in reading order.
// ponytail: tolerance-based comparator is not strictly transitive; fine for a few dozen lines per image.
export function toLines(results, minConfidence = 0.5) {
  const lines = results
    .map(({ text, confidence, box }) => ({ text: text.trim(), confidence, box }))
    .filter(l => l.text && l.confidence >= minConfidence)
    .map(({ text, box: { x, y, width: w, height: h } }) => ({
      text, x, y, w, h,
      vertical: h > w * 1.5 && [...text].length > 1,
    }));
  const vertical = lines.filter(l => l.vertical).length > lines.length / 2;
  if (vertical) {
    const sameCol = (a, b) => Math.abs(a.x - b.x) < Math.min(a.w, b.w) / 2;
    return lines.sort((a, b) => (sameCol(a, b) ? a.y - b.y : b.x - a.x));
  }
  // Group lines into blocks (speech bubbles): stacked closely and overlapping horizontally.
  // Then read block by block, so two bubbles side by side don't interleave row by row.
  const block = lines.map((_, i) => i);
  const find = i => (block[i] === i ? i : (block[i] = find(block[i])));
  lines.forEach((a, i) => lines.forEach((b, j) => {
    if (j <= i) return;
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    if (overlapX > 0 && gapY < Math.min(a.h, b.h) * 0.8) block[find(i)] = find(j);
  }));
  const groups = new Map();
  lines.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));
  const blocks = [...groups.values()].map(g => g.sort((a, b) => a.y - b.y));
  const sameRow = (a, b) => Math.abs(a.y - b.y) < Math.min(a.h, b.h);
  return blocks
    .sort(([a], [b]) => (sameRow(a, b) ? a.x - b.x : a.y - b.y))
    .flat();
}
