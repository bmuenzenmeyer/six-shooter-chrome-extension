// Copyright (C) 2026 Brian Muenzenmeyer
// SPDX-License-Identifier: GPL-3.0-or-later

// Draws the revolver-cylinder toolbar icon with `loaded` of `chambers` chambers
// lit, so the icon fills up as tabs accumulate. Same geometry as
// tools/make_icons.py, but rendered live for chrome.action.setIcon. Returns an
// imageData set, or null where there's no canvas (e.g. the Node test runner).

const BRASS = '#c9a227';
const BODY = '#1f2126';
const HOLE = '#101114';
const OVER = '#c4462f';

function drawCylinder(ctx, size, loaded, chambers, over) {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.47, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.43, 0, 2 * Math.PI);
  ctx.fill();

  const ringR = size * 0.265;
  const chamberR = size * 0.098;
  for (let i = 0; i < chambers; i += 1) {
    const a = (-90 + (i * 360) / chambers) * (Math.PI / 180);
    const x = c + ringR * Math.cos(a);
    const y = c + ringR * Math.sin(a);
    ctx.beginPath();
    ctx.arc(x, y, chamberR, 0, 2 * Math.PI);
    if (i < loaded) {
      ctx.fillStyle = BRASS; // a chambered round
      ctx.fill();
    } else {
      ctx.fillStyle = HOLE; // an empty chamber, ringed so it still reads
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.02);
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.4)';
      ctx.stroke();
    }
  }

  ctx.fillStyle = over ? OVER : BRASS; // red hub warns you're past the limit
  ctx.beginPath();
  ctx.arc(c, c, size * 0.06, 0, 2 * Math.PI);
  ctx.fill();
}

export function renderIconSet(loaded, chambers) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const shown = Math.max(0, Math.min(loaded, chambers));
  const over = loaded > chambers;
  const set = {};
  for (const size of [16, 32]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawCylinder(ctx, size, shown, chambers, over);
    set[size] = ctx.getImageData(0, 0, size, size);
  }
  return set;
}
