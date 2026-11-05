// Tall images (webtoon strips) are OCR'd in overlapping slices: the detector shrinks the whole
// image to its input size, so a 900×12000 strip would come out unreadable in one pass.
// ponytail: square slices; tune step if huge lettering gets split.
export function slices(width, height, overlap = 150) {
  if (height <= width * 2) return [{ from: 0, to: height, top: 0, bottom: height }];
  const out = [];
  for (let from = 0; from < height; from += width) {
    const to = Math.min(from + width, height);
    out.push({ from, to, top: Math.max(0, from - overlap), bottom: Math.min(height, to + overlap) });
  }
  return out;
}

// Results from one slice -> strip coords, keeping only lines centred in the slice core.
export const inCore = (results, s) => results
  .map(({ box: { x, y, width, height }, ...rest }) => ({ ...rest, box: { x, y: y + s.top, width, height } }))
  .filter(({ box }) => { const c = box.y + box.height / 2; return c >= s.from && c < s.to; });
