/**
 * Lattice — a rigid grid made to carry something it was not built for.
 *
 * Chosen for city and machine imagery. The grid is subdivided unevenly, cells
 * are filled by rule, and a few are deliberately broken — the structure holds,
 * but not everywhere.
 */

import type { RenderEnv, SystemDraw } from '../renderer';

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

export const lattice: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise } = env;

  const margin = unit * 0.04;
  const maxDepth = Math.round(3 + genome.density * 5);

  // Recursive subdivision, but noise decides which cells keep splitting, so
  // the density follows a field rather than being uniformly random.
  const cells: Cell[] = [];
  const queue: Cell[] = [
    { x: margin, y: margin, w: width - margin * 2, h: height - margin * 2, depth: 0 },
  ];

  while (queue.length > 0) {
    const cell = queue.pop() as Cell;
    const field = noise(cell.x * 0.0016, cell.y * 0.0016);
    const shouldSplit =
      cell.depth < maxDepth &&
      cell.w > unit * 0.03 &&
      cell.h > unit * 0.03 &&
      rng.next() < 0.42 + field * 0.5;

    if (!shouldSplit) {
      cells.push(cell);
      continue;
    }

    // Split along the longer axis so cells stay reasonably proportioned.
    const vertical = cell.w > cell.h ? true : cell.h > cell.w ? false : rng.bool();
    // Symmetry pulls the cut toward the middle; disorder pushes it off.
    const middle = 0.5;
    const ratio = middle + rng.gaussian(0, 0.16 * (1 - genome.symmetry * 0.7));
    const clamped = Math.max(0.18, Math.min(0.82, ratio));

    if (vertical) {
      const w1 = cell.w * clamped;
      queue.push({ x: cell.x, y: cell.y, w: w1, h: cell.h, depth: cell.depth + 1 });
      queue.push({ x: cell.x + w1, y: cell.y, w: cell.w - w1, h: cell.h, depth: cell.depth + 1 });
    } else {
      const h1 = cell.h * clamped;
      queue.push({ x: cell.x, y: cell.y, w: cell.w, h: h1, depth: cell.depth + 1 });
      queue.push({ x: cell.x, y: cell.y + h1, w: cell.w, h: cell.h - h1, depth: cell.depth + 1 });
    }
  }
  yield 0.2;

  const gutter = unit * 0.002 * (1 + genome.weight);

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i] as Cell;
    const field = noise(cell.x * 0.003 + 40, cell.y * 0.003 + 40);

    // Fracture: a few cells break out of the grid entirely.
    const broken = rng.next() < genome.turbulence * 0.16;
    const shove = broken ? unit * 0.02 * genome.turbulence : 0;
    const x = cell.x + gutter + (broken ? rng.range(-shove, shove) : 0);
    const y = cell.y + gutter + (broken ? rng.range(-shove, shove) : 0);
    const w = Math.max(1, cell.w - gutter * 2);
    const h = Math.max(1, cell.h - gutter * 2);

    const color = broken || rng.next() > 0.94
      ? palette.accent
      : (palette.marks[Math.floor(field * palette.marks.length) % palette.marks.length] as string);

    // Cells are one of a small number of treatments — solid, hatched, outlined,
    // or windowed — so the grid has a vocabulary rather than one repeated fill.
    const treatment = rng.next();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    if (treatment < 0.34) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2 + field * (0.4 + genome.weight * 0.4);
      ctx.fillRect(x, y, w, h);
    } else if (treatment < 0.62) {
      // Hatching, angled by the noise field.
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3 + field * 0.4;
      ctx.lineWidth = unit * 0.0006 * (1 + genome.weight * 2);
      const spacing = Math.max(3, unit * 0.006 * (1.6 - genome.density));
      const diagonal = field > 0.5;
      const span = w + h;
      for (let s = -span; s < span; s += spacing) {
        ctx.beginPath();
        if (diagonal) {
          ctx.moveTo(x + s, y);
          ctx.lineTo(x + s + h, y + h);
        } else {
          ctx.moveTo(x, y + s);
          ctx.lineTo(x + w, y + s);
        }
        ctx.stroke();
      }
    } else if (treatment < 0.84) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45 + field * 0.4;
      ctx.lineWidth = unit * 0.0008 * (1 + genome.weight * 3);
      ctx.strokeRect(x, y, w, h);
    } else {
      // Windows — small lit rectangles, the one figurative gesture in the set.
      const cols = Math.max(1, Math.round(w / (unit * 0.014)));
      const rows = Math.max(1, Math.round(h / (unit * 0.02)));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (rng.next() > 0.42 + genome.density * 0.3) continue;
          ctx.fillStyle = rng.next() > 0.88 ? palette.accent : color;
          ctx.globalAlpha = 0.3 + rng.next() * 0.6;
          ctx.fillRect(
            x + (c + 0.22) * (w / cols),
            y + (r + 0.22) * (h / rows),
            (w / cols) * 0.56,
            (h / rows) * 0.56,
          );
        }
      }
    }
    ctx.restore();

    if (i % 12 === 0) yield 0.2 + (i / cells.length) * 0.65;
  }

  // Circuit runs — long right-angled paths threaded over the grid.
  const runs = Math.round(3 + genome.density * 16);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  for (let i = 0; i < runs; i += 1) {
    ctx.strokeStyle = i % 4 === 0 ? palette.accent : palette.veil;
    ctx.globalAlpha = 0.3 + rng.next() * 0.45;
    ctx.lineWidth = unit * (0.0006 + genome.weight * 0.003);
    let px = rng.range(0, width);
    let py = rng.range(0, height);
    ctx.beginPath();
    ctx.moveTo(px, py);
    const legs = rng.int(3, 9);
    for (let l = 0; l < legs; l += 1) {
      const length = unit * rng.range(0.04, 0.3);
      if (l % 2 === 0) px += rng.bool() ? length : -length;
      else py += rng.bool() ? length : -length;
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Terminal node.
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(px, py, unit * 0.0025 * (1 + genome.weight), 0, Math.PI * 2);
    ctx.fill();
    yield 0.85 + (i / runs) * 0.15;
  }

  ctx.globalAlpha = 1;
};
