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
  const sameRow = (a, b) => Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2;
  const sameCol = (a, b) => Math.abs(a.x - b.x) < Math.min(a.w, b.w) / 2;
  return lines.sort(vertical
    ? (a, b) => (sameCol(a, b) ? a.y - b.y : b.x - a.x)
    : (a, b) => (sameRow(a, b) ? a.x - b.x : a.y - b.y));
}
