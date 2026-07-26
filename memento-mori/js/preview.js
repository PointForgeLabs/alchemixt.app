// Canvas preview. Draws the plate at true scale with round-capped strokes at the
// real pen width, so what you see is close to what the plotter lays down --
// including the moments when the pitch is finer than the pen and the hatching
// fills in solid.

const LAYER_COLOURS = {
  contour: '#111318',
  marks: '#3a2f5e',
  engrave: '#1c3f57',
  cross: '#155e52',
  hatch: '#7a4a12',
  deep: '#7d2233',
  stipple: '#5c3a6e',
  ornament: '#2c2c34',
  lettering: '#111318',
  'tone-dark': '#111318',
  'tone-mid': '#1c3f57',
  'tone-light': '#7a4a12',
  all: '#111318',
};

export class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'plot';
    this.drawing = null;
    this.layers = null;
    this.showTravel = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  setDrawing(drawing, layers) {
    this.drawing = drawing;
    this.layers = layers;
    this.render();
  }

  setMode(mode) { this.mode = mode; this.render(); }

  setShowTravel(v) { this.showTravel = v; this.render(); }

  /** Fit the page into the available box, returning the transform. */
  _fit() {
    const d = this.drawing;
    const box = this.canvas.parentElement.getBoundingClientRect();
    const availW = Math.max(120, box.width - 32);
    const availH = Math.max(120, box.height - 32);
    const scale = Math.min(availW / d.widthMm, availH / d.heightMm);
    const w = d.widthMm * scale, h = d.heightMm * scale;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    return scale * this.dpr;
  }

  render() {
    if (!this.drawing) return;
    const ctx = this.ctx;
    const s = this._fit();
    const d = this.drawing;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Paper.
    ctx.fillStyle = '#F6F1E4';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(s, s);

    if (this.mode === 'reference' || this.mode === 'ink') {
      this._drawRaster(ctx, this.mode === 'ink');
      ctx.restore();
      return;
    }

    const penMm = d.params.penWidth;
    const single = this.mode === 'plot';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = penMm;

    for (const layer of this.layers) {
      ctx.strokeStyle = single ? '#14161c' : (LAYER_COLOURS[layer.id] || '#14161c');
      ctx.globalAlpha = single ? 0.92 : 0.85;
      ctx.beginPath();
      for (const path of layer.paths) {
        if (path.length < 2) continue;
        ctx.moveTo(path[0][0], path[0][1]);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      }
      ctx.stroke();
    }

    if (this.showTravel) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = Math.max(0.06, 0.5 / s);
      ctx.beginPath();
      let cur = null;
      for (const layer of this.layers) {
        for (const path of layer.paths) {
          if (cur) { ctx.moveTo(cur[0], cur[1]); ctx.lineTo(path[0][0], path[0][1]); }
          cur = path[path.length - 1];
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The underlying render, drawn in the picture box for comparison. */
  _drawRaster(ctx, showInk) {
    const d = this.drawing;
    const f = d.fields;
    if (!f) return;
    const { width: w, height: h } = f;
    if (!this._rasterCanvas || this._rasterKey !== `${w}x${h}:${showInk}:${d.stamp}`) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cctx = c.getContext('2d');
      const img = cctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        let v;
        if (showInk) v = 255 - Math.round(Math.min(1, d.ink[i]) * 255);
        else v = f.mask[i] ? Math.round(f.lum[i] * 255) : 246;
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      cctx.putImageData(img, 0, 0);
      this._rasterCanvas = c;
      this._rasterKey = `${w}x${h}:${showInk}:${d.stamp}`;
    }
    const box = d.plan.box;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._rasterCanvas, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  }

  /** PNG data URL of the current preview, for saving a proof. */
  toDataURL() { return this.canvas.toDataURL('image/png'); }
}
