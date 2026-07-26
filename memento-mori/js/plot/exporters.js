// Plotter file formats. All three take the same layered, millimetre-space
// drawing and differ only in dialect.

const fmt = (v, dp = 3) => {
  const s = v.toFixed(dp);
  return s.replace(/\.?0+$/, '') || '0';
};

function pathData(path, dp = 3) {
  let d = `M${fmt(path[0][0], dp)},${fmt(path[0][1], dp)}`;
  for (let i = 1; i < path.length; i++) {
    d += `L${fmt(path[i][0], dp)},${fmt(path[i][1], dp)}`;
  }
  return d;
}

/**
 * SVG in real millimetres, one Inkscape layer per pen pass.
 *
 * Layer names are prefixed with their number because that is what the AxiDraw
 * extension reads to assign per-layer pen height and speed; Inkscape's own layer
 * dialog shows the same names.
 */
export function toSvg(drawing, layers, opts = {}) {
  const {
    penWidth = 0.25,
    background = null,
    title = 'Memento mori',
    meta = {},
    dp = 3,
  } = opts;
  const w = fmt(drawing.widthMm, 4);
  const h = fmt(drawing.heightMm, 4);

  const out = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" ` +
    `width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" version="1.1">`
  );
  out.push(`  <title>${escapeXml(title)}</title>`);
  const metaLines = Object.entries(meta)
    .map(([k, v]) => `      ${escapeXml(k)}: ${escapeXml(String(v))}`)
    .join('\n');
  out.push(`  <desc>\n${metaLines}\n  </desc>`);
  out.push(
    `  <sodipodi:namedview inkscape:document-units="mm" units="mm" />`
  );
  if (background) {
    out.push(`  <rect x="0" y="0" width="${w}" height="${h}" fill="${background}" />`);
  }

  layers.forEach((layer, i) => {
    const label = `${i + 1}-${layer.name}`;
    out.push(
      `  <g inkscape:groupmode="layer" inkscape:label="${escapeXml(label)}" ` +
      `id="layer-${layer.id}" fill="none" stroke="${layer.color || '#000000'}" ` +
      `stroke-width="${fmt(penWidth, 3)}" stroke-linecap="round" stroke-linejoin="round">`
    );
    for (const path of layer.paths) {
      if (path.length < 2) continue;
      out.push(`    <path d="${pathData(path, dp)}"/>`);
    }
    out.push(`  </g>`);
  });

  out.push(`</svg>`);
  return out.join('\n');
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

/**
 * G-code for a generic three-axis pen plotter. Pen lift is a Z move, which is
 * what grbl-based machines and most DIY plotters expect; `servo` switches to the
 * M280 form used by some pen holders instead.
 */
export function toGcode(drawing, layers, opts = {}) {
  const {
    penUpZ = 5, penDownZ = 0, feedDraw = 3000, feedTravel = 6000,
    servo = false, servoUp = 30, servoDown = 90, dwellMs = 120,
    flipY = true, originBottomLeft = true,
  } = opts;
  const H = drawing.heightMm;
  const ty = (y) => (flipY ? H - y : y);

  const L = [];
  L.push('; memento mori — generated plate');
  L.push(`; page ${fmt(drawing.widthMm, 2)} x ${fmt(drawing.heightMm, 2)} mm`);
  L.push(`; origin ${originBottomLeft ? 'bottom-left' : 'top-left'}`);
  L.push('G21 ; millimetres');
  L.push('G90 ; absolute');
  const up = () => (servo
    ? [`M280 P0 S${servoUp}`, `G4 P${dwellMs}`]
    : [`G0 Z${fmt(penUpZ, 2)}`]);
  const down = () => (servo
    ? [`M280 P0 S${servoDown}`, `G4 P${dwellMs}`]
    : [`G1 Z${fmt(penDownZ, 2)} F${feedTravel}`]);
  L.push(...up());
  L.push('G0 X0 Y0');

  layers.forEach((layer, i) => {
    L.push(`; --- layer ${i + 1}: ${layer.name} (${layer.paths.length} strokes)`);
    for (const path of layer.paths) {
      if (path.length < 2) continue;
      L.push(`G0 X${fmt(path[0][0], 3)} Y${fmt(ty(path[0][1]), 3)} F${feedTravel}`);
      L.push(...down());
      for (let k = 1; k < path.length; k++) {
        L.push(`G1 X${fmt(path[k][0], 3)} Y${fmt(ty(path[k][1]), 3)} F${feedDraw}`);
      }
      L.push(...up());
    }
  });

  L.push('G0 X0 Y0');
  L.push('M2');
  return L.join('\n');
}

/** HPGL for pen plotters that speak it (HP 7475A and the many clones). */
export function toHpgl(drawing, layers, opts = {}) {
  const { unitsPerMm = 40, flipY = true, penPerLayer = true } = opts;
  const H = drawing.heightMm;
  const X = (x) => Math.round(x * unitsPerMm);
  const Y = (y) => Math.round((flipY ? H - y : y) * unitsPerMm);

  const out = ['IN;'];
  layers.forEach((layer, i) => {
    out.push(`SP${penPerLayer ? Math.min(8, i + 1) : 1};`);
    for (const path of layer.paths) {
      if (path.length < 2) continue;
      out.push(`PU${X(path[0][0])},${Y(path[0][1])};`);
      const seg = path.slice(1).map((q) => `${X(q[0])},${Y(q[1])}`).join(',');
      out.push(`PD${seg};`);
    }
    out.push('PU;');
  });
  out.push('SP0;');
  return out.join('\n');
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
