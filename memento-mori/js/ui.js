// Builds the control panel from the parameter schema. Every control is derived,
// so a new parameter in params.js appears here, in the permalink and in the
// exported metadata without any further wiring.

import { GROUPS, controlByKey } from './params.js';

export class Panel {
  constructor(root, state, onChange) {
    this.root = root;
    this.state = state;
    this.onChange = onChange;
    this.rows = new Map();
    this._build();
  }

  _build() {
    for (const group of GROUPS) {
      const details = document.createElement('details');
      details.className = 'group';
      details.open = group.id === 'composition' || group.id === 'skull';
      const summary = document.createElement('summary');
      summary.textContent = group.title;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'group-body';
      for (const c of group.controls) body.appendChild(this._row(c));
      details.appendChild(body);
      this.root.appendChild(details);
    }
    this.refresh();
  }

  _row(c) {
    const row = document.createElement('div');
    row.className = `row row-${c.type}`;
    row.dataset.key = c.key;

    const label = document.createElement('label');
    label.className = 'row-label';
    label.htmlFor = `c-${c.key}`;
    label.textContent = c.label;
    if (c.hint) label.title = c.hint;

    // Only sliders get a numeric readout; a select or a checkbox already shows
    // its own value, and the extra cell wraps their two-column grid.
    const value = c.type === 'range' ? document.createElement('span') : null;
    if (value) value.className = 'row-value';

    let input;
    if (c.type === 'range') {
      input = document.createElement('input');
      input.type = 'range';
      input.min = c.min; input.max = c.max; input.step = c.step;
      input.addEventListener('input', () => {
        this.state[c.key] = parseFloat(input.value);
        if (value) value.textContent = this._formatValue(c, this.state[c.key]);
        this.onChange(c.key, { live: true });
      });
      input.addEventListener('change', () => this.onChange(c.key, { live: false }));
    } else if (c.type === 'select') {
      input = document.createElement('select');
      for (const o of c.options) {
        const opt = document.createElement('option');
        opt.value = o.v; opt.textContent = o.label;
        input.appendChild(opt);
      }
      input.addEventListener('change', () => {
        this.state[c.key] = input.value;
        this.onChange(c.key, { live: false });
      });
    } else if (c.type === 'toggle') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => {
        this.state[c.key] = input.checked;
        this.onChange(c.key, { live: false });
      });
    } else if (c.type === 'text') {
      input = document.createElement('input');
      input.type = 'text';
      input.spellcheck = false;
      input.addEventListener('input', () => {
        this.state[c.key] = input.value;
        this.onChange(c.key, { live: true });
      });
      input.addEventListener('change', () => this.onChange(c.key, { live: false }));
    } else if (c.type === 'seed') {
      input = document.createElement('input');
      input.type = 'text';
      input.spellcheck = false;
      input.className = 'seed-input';
      input.addEventListener('change', () => {
        this.state[c.key] = input.value;
        this.onChange(c.key, { live: false });
      });
      const dice = document.createElement('button');
      dice.type = 'button';
      dice.className = 'dice';
      dice.title = 'New seed';
      dice.textContent = '⚄';
      dice.addEventListener('click', () => {
        input.value = randomSeed();
        this.state[c.key] = input.value;
        this.onChange(c.key, { live: false });
      });
      row.appendChild(label);
      const wrap = document.createElement('div');
      wrap.className = 'seed-wrap';
      wrap.append(input, dice);
      row.appendChild(wrap);
      this.rows.set(c.key, { row, input, value: null, control: c });
      return row;
    }

    input.id = `c-${c.key}`;
    if (value) row.append(label, input, value);
    else row.append(label, input);
    this.rows.set(c.key, { row, input, value, control: c });
    return row;
  }

  _formatValue(c, v) {
    if (typeof v !== 'number') return String(v);
    const step = c.step || 0.01;
    const dp = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
    return `${v.toFixed(dp)}${c.unit ? ` ${c.unit}` : ''}`;
  }

  /** Push state into the widgets, and apply any `showIf` visibility rules. */
  refresh() {
    for (const [key, r] of this.rows) {
      const c = r.control;
      const v = this.state[key];
      if (c.type === 'toggle') r.input.checked = !!v;
      else if (r.input.value !== String(v)) r.input.value = v;
      if (r.value) r.value.textContent = this._formatValue(c, v);
      if (c.showIf) r.row.style.display = c.showIf(this.state) ? '' : 'none';
    }
  }

  /** Grey out line controls that the active style preset is driving. */
  markPresetDriven(keys) {
    for (const [key, r] of this.rows) {
      r.row.classList.toggle('preset-driven', keys.has(key));
    }
  }
}

const SEED_WORDS = [
  'ossuary', 'vanitas', 'reliquary', 'catacomb', 'requiem', 'cinder', 'ashen',
  'vigil', 'shroud', 'lantern', 'hourglass', 'marrow', 'ivory', 'sepulchre',
  'tolling', 'candle', 'dust', 'ember', 'quietus', 'threnody', 'cypress',
];

export function randomSeed() {
  const w = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  const n = String(Math.floor(Math.random() * 900) + 100);
  return `${w}-${n}`;
}

/* ------------------------------------------------------------ url state --- */

export function encodeState(state) {
  const out = {};
  for (const g of GROUPS) {
    for (const c of g.controls) {
      const v = state[c.key];
      if (v === c.def) continue;                 // defaults stay out of the URL
      out[c.key] = typeof v === 'number' ? +v.toFixed(4) : v;
    }
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(out))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(hash) {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const raw = JSON.parse(json);
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const c = controlByKey(k);
      if (!c) continue;
      if (c.type === 'range') {
        const n = parseFloat(v);
        if (Number.isFinite(n)) out[k] = Math.min(c.max, Math.max(c.min, n));
      } else if (c.type === 'toggle') {
        out[k] = !!v;
      } else if (c.type === 'select') {
        if (c.options.some((o) => String(o.v) === String(v))) out[k] = v;
      } else {
        out[k] = String(v).slice(0, 120);
      }
    }
    return out;
  } catch {
    return null;
  }
}
