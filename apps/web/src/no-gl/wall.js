/* =====================================================================
 * no-GL 无限照片墙 · React 版控制器
 * 由 demo/no-gl-grid/main.js 迁移：wrap → warp → inset → homography(matrix3d)
 * React 组件负责渲染静态 UI，本模块负责全部运行逻辑。
 * ===================================================================== */
let wallImages = [];
let rafId = 0;
let attached = false;

let stage, gridEl, torchEl, torchGlowEl, torchRingEl, dimEl, coverEl;
let btnTorch, btnReset, btnZoomIn, btnZoomOut, btnFit, zoomValue, statusEl, interactionHint;
let statusTimer = 0;

/* ---------------- 可调参数 ---------------- */
const BOW = 0.06;
const BULGE = 0.16;
const REACH = 1.5;
const FLIP = 0.7;
const DAMP_PAN = 0.1;
const DAMP_FLIP = 0.12;
const DAMP_CURSOR = 0.16;
const SHADE = 0.55;
const GAP = 8;
const RADIUS = 12;
const IMG_BLEED = 1.1;
const FLIP_MARGIN = 0.16;
const CARD_TARGET = 330;
const PANEL_RATIO = 0.42;
const PANEL_GAP = 8;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.3;


/* ---------------- 状态 ---------------- */
const state = {
  gen: 0,
  w: 0,
  h: 0,
  card: 320,
  period: 336,
  cols: 2,
  rows: 2,
  zoom: 1,
  x: { cur: 0, tgt: 0 },
  y: { cur: 0, tgt: 0 },
  cursor: { x: 0, y: 0 },
  raw: { x: 0, y: 0 },
  vel: 0,
  lag: 0,
  drag: null,
  press: null,
  pinch: null,
  lastDragMoved: 0,
  torch: false,
  torchOpacity: -1,
  cardDimOpacity: -1,
  flip: { id: -1, p: 0, tgt: 0 },
  hole: 300,
  holeX: -1,
  holeY: -1,
  last: performance.now(),
};
let cards = [];
let deckOrder = [];
let cardSeq = 1;
let preloadStarted = false;
const pointers = new Map();

/* ---------------- 数学 ---------------- */
const wrap = (min, max, v) => {
  const r = max - min;
  return min + (((v - min) % r + r) % r);
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const damp = (from, to, rate, dt) =>
  reduceMotion.matches ? to : from + (to - from) * (1 - Math.pow(1 - rate, dt));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
  );

const imageFormat = (src) => {
  const match = String(src).match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  const format = match?.[1]?.toUpperCase() || '图片';
  return format === 'JPG' ? 'JPEG' : format;
};

function showStatus(message) {
  if (!statusEl) return;
  clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.classList.remove('visible');
  requestAnimationFrame(() => statusEl.classList.add('visible'));
  statusTimer = setTimeout(() => statusEl?.classList.remove('visible'), 1600);
}

const warp = (px, py) => {
  const halfW = state.w / 2;
  const halfH = state.h / 2;
  const nx = px / halfW;
  const ny = py / halfH;
  const f = 1 + BOW * (nx * nx + ny * ny);
  let wx = px * f;
  let wy = py * f;
  const dx = wx - state.cursor.x;
  const dy = wy - state.cursor.y;
  const calm = 1 / (1 + state.lag / 40);
  const reach2 = REACH * REACH * state.period * state.period;
  const push = BULGE * calm * Math.exp(-(dx * dx + dy * dy) / reach2);
  return { x: wx + dx * push, y: wy + dy * push };
};

const inset = (p, a, b, g) => {
  const d = g / 2;
  const la = Math.hypot(a.x - p.x, a.y - p.y) || 1;
  const lb = Math.hypot(b.x - p.x, b.y - p.y) || 1;
  const e1x = (a.x - p.x) / la;
  const e1y = (a.y - p.y) / la;
  const e2x = (b.x - p.x) / lb;
  const e2y = (b.y - p.y) / lb;
  return { x: p.x + (e1x + e2x) * d, y: p.y + (e1y + e2y) * d };
};

const matrix = (w, q0, q1, q2, q3) => {
  const dx1 = q1.x - q3.x;
  const dy1 = q1.y - q3.y;
  const dx2 = q2.x - q3.x;
  const dy2 = q2.y - q3.y;
  const sx = q0.x - q1.x - q2.x + q3.x;
  const sy = q0.y - q1.y - q2.y + q3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const h = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = q1.x - q0.x + g * q1.x;
  const b = q2.x - q0.x + h * q2.x;
  const d = q1.y - q0.y + g * q1.y;
  const e = q2.y - q0.y + h * q2.y;
  return `matrix3d(${a / w}, ${d / w}, 0, ${g / w}, ${b / w}, ${e / w}, 0, ${h / w}, 0, 0, 1, 0, ${q0.x}, ${q0.y}, 0, 1)`;
};

/* ---------------- 网格构建 ---------------- */
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function getDeckOrder() {
  if (deckOrder.length !== wallImages.length) {
    deckOrder = shuffle(Array.from({ length: wallImages.length }, (_, i) => i));
  }
  return deckOrder;
}

function build() {
  const gen = ++state.gen;
  for (const c of cards) c.el.remove();
  cards = [];
  state.w = innerWidth;
  state.h = innerHeight;

  const shortSide = Math.min(state.w, state.h);
  const heightTarget = Math.max(180, shortSide * 0.46) * state.zoom;
  const widthTarget = CARD_TARGET * state.zoom;
  const target = clamp(Math.min(widthTarget, heightTarget), 120, 760);
  state.cols = clamp(Math.round(state.w / target), 2, 8);
  state.card = clamp((state.w - (state.cols - 1) * GAP) / state.cols, 120, 760);
  state.period = state.card + GAP;
  state.rows = Math.max(2, Math.ceil(innerHeight / state.period));

  // 照片数量超过单屏格子时补足行数，保证全部照片至少出现一次
  if (wallImages.length > state.cols * state.rows) {
    state.rows = Math.ceil(wallImages.length / state.cols);
  }

  // +2 是承重细节：换行卡片翻越边缘前需在两侧各留至少一个整格
  const cols = state.cols + 2;
  const rows = state.rows + 2;

  gridEl.style.setProperty('--card', state.card + 'px');
  gridEl.style.setProperty('--gap', GAP + 'px');
  gridEl.style.setProperty('--r', RADIUS + 'px');
  gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--card))`;
  gridEl.style.gridAutoRows = 'var(--card)';

  const n = wallImages.length;
  const order = getDeckOrder();
  const fallback = n ? `共 ${n} 张照片` : '暂无照片';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const imgIdx = n ? order[(r * cols + c) % n] : -1;
      const item = n ? wallImages[imgIdx] : null;
      const title = item ? item.title : '空';
      const el = document.createElement('figure');
      el.className = 'card';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', item ? `查看 ${title} 的详情` : '空照片位');
      const id = cardSeq++;
      el.dataset.cardId = String(id);
      el.innerHTML =
        `<div class="media" data-fallback="${escapeHtml(fallback)}">` +
        `<img alt="${escapeHtml(title)}" loading="lazy" decoding="async" draggable="false">` +
        `<figcaption class="caption">${escapeHtml(title)}</figcaption>` +
        `</div>` +
        `<div class="card-dim"></div>` +
        `<aside class="panel">` +
        `<button class="close" type="button" aria-label="关闭">` +
        `<svg class="icon"><use href="#i-close"/></svg>` +
        `</button>` +
        `<h3 class="p-title">${escapeHtml(title)}</h3>` +
        `<p class="p-desc">${item ? `${imageFormat(item.src)} 照片` : '暂无照片信息'}</p>` +
        `<dl class="meta">` +
        `<div><dt>序号</dt><dd>${item ? `${imgIdx + 1} / ${n}` : '—'}</dd></div>` +
        `<div><dt>分辨率</dt><dd class="meta-resolution">读取中</dd></div>` +
        `<div><dt>画面</dt><dd class="meta-orientation">—</dd></div>` +
        `</dl>` +
        `</aside>`;
      const img = el.querySelector('img');
      if (item) img.src = item.src;
      img.addEventListener('load', () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        const resolution = el.querySelector('.meta-resolution');
        const orientation = el.querySelector('.meta-orientation');
        if (resolution) resolution.textContent = `${width} × ${height}`;
        if (orientation) orientation.textContent = width === height ? '方形' : width > height ? '横向' : '竖向';
      });
      img.addEventListener('error', () => {
        el.querySelector('.media').classList.add('broken');
        const resolution = el.querySelector('.meta-resolution');
        if (resolution) resolution.textContent = '不可用';
      });
      gridEl.appendChild(el);
      cards.push({
        el,
        img,
        id,
        itemId: imgIdx,
        dim: el.querySelector('.card-dim'),
        left: c * state.period,
        top: r * state.period,
        parked: false,
        written: false,
      });
    }
  }

  if (gen === state.gen) {
    buildTorchMask();
    updateTorch(true);
  }
  preloadImages();
}

function preloadImages() {
  if (preloadStarted || coverEl.classList.contains('done')) return;
  const unique = [...new Set(wallImages.map((i) => i.src))];
  if (!unique.length) {
    revealCover();
    return;
  }
  let settled = 0;
  const done = () => {
    if (++settled >= unique.length) revealCover();
  };
  for (const src of unique) {
    const im = new Image();
    im.decoding = 'async';
    im.onload = done;
    im.onerror = done;
    im.src = src;
  }
  setTimeout(revealCover, 4500);
}

function revealCover() {
  if (!coverEl.classList.contains('done')) coverEl.classList.add('done');
}

function buildTorchMask() {
  if (!torchEl) return;
  const hole = clamp(Math.min(state.w, state.h) * 0.3, 140, 420);
  const edge = hole * 2.15;
  state.hole = hole;
  let stops = '';
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stops += `rgba(0,0,0,${smooth(t).toFixed(4)}) ${Math.round(t * edge)}px,`;
  }
  stops += 'rgba(0,0,0,1) 100%';
  const g = `radial-gradient(circle at var(--tx) var(--ty), ${stops})`;
  torchEl.style.webkitMaskImage = g;
  torchEl.style.maskImage = g;
  torchEl.style.setProperty('--hole', hole + 'px');
  torchEl.style.setProperty('--edge', edge + 'px');
  torchRingEl.style.setProperty('--hole', hole + 'px');
  if (state.holeX < 0) setTorchHole(state.w / 2, state.h / 2);
}

function setTorchHole(x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px === state.holeX && py === state.holeY) return;
  state.holeX = px;
  state.holeY = py;
  for (const el of [torchEl, torchGlowEl, torchRingEl]) {
    el.style.setProperty('--tx', px + 'px');
    el.style.setProperty('--ty', py + 'px');
  }
}

function updateTorch(force = false) {
  if (!state.torch) return;
  if (force || state.holeX < 0) setTorchHole(state.w / 2, state.h / 2);
  const x = clamp(state.cursor.x + state.w / 2, state.hole * 0.55, state.w - state.hole * 0.55);
  const y = clamp(state.cursor.y + state.h / 2, state.hole * 0.55, state.h - state.hole * 0.55);
  setTorchHole(x, y);
}

function setTorch(on) {
  state.torch = on;
  for (const el of [torchEl, torchGlowEl, torchRingEl]) {
    el.classList.toggle('on', on);
    el.classList.toggle('off', !on);
  }
  btnTorch.classList.toggle('on', on);
  btnTorch.setAttribute('aria-pressed', String(on));
  showStatus(on ? '手电筒已开启' : '手电筒已关闭');
  if (on) {
    state.raw.x = 0;
    state.raw.y = 0;
    updateTorch(true);
  }
  if (!on) state.torchOpacity = -1;
}

function draw() {
  const dt = clamp((performance.now() - state.last) / 16.666, 0, 3);
  state.last = performance.now();

  state.x.cur = damp(state.x.cur, state.x.tgt, DAMP_PAN, dt);
  state.y.cur = damp(state.y.cur, state.y.tgt, DAMP_PAN, dt);
  state.cursor.x = damp(state.cursor.x, state.raw.x, DAMP_CURSOR, dt);
  state.cursor.y = damp(state.cursor.y, state.raw.y, DAMP_CURSOR, dt);
  state.lag = lerp(state.lag, state.vel, 0.07);
  state.flip.p = damp(state.flip.p, state.flip.tgt, DAMP_FLIP, dt);

  const { w, h, card } = state;
  const halfW = w / 2;
  const halfH = h / 2;
  const maxX = (state.cols + 2) * state.period;
  const maxY = (state.rows + 2) * state.period;
  const marginX = (w - maxX) / 2;
  const marginY = (h - maxY) / 2;
  const pad = state.period;

  const flipE = smooth(clamp(state.flip.p, 0, 1));
  const flipActive = state.flip.id >= 0;

  const shadeLevel = SHADE * flipE;
  if (Math.abs(shadeLevel - state.cardDimOpacity) > 0.004) {
    state.cardDimOpacity = shadeLevel;
    const opacity = shadeLevel.toFixed(3);
    dimEl.style.opacity = opacity;
    for (const cell of cards) {
      cell.dim.style.opacity = cell.id === state.flip.id ? '0' : opacity;
    }
  }

  let target = null;
  if (flipActive) {
    const available = h * (1 - FLIP_MARGIN * 2);
    const s = Math.min(FLIP * Math.min(w, h), (available - PANEL_GAP) / (1 + PANEL_RATIO));
    const panelH = s * PANEL_RATIO;
    const top = (h - s - PANEL_GAP - panelH) / 2;
    const cx = w / 2;
    target = {
      q: [
        { x: cx - s / 2, y: top },
        { x: cx + s / 2, y: top },
        { x: cx - s / 2, y: top + s },
        { x: cx + s / 2, y: top + s },
      ],
    };
  }

  const still =
    Math.abs(state.x.cur - state.x.tgt) < 0.01 &&
    Math.abs(state.y.cur - state.y.tgt) < 0.01 &&
    Math.abs(state.flip.p - state.flip.tgt) < 0.0005 &&
    Math.abs(state.cursor.x - state.raw.x) < 0.05 &&
    Math.abs(state.cursor.y - state.raw.y) < 0.05;

  updateTorch();

  const torchLevel = state.torch ? 1 - flipE : 0;
  if (Math.abs(torchLevel - state.torchOpacity) > 0.004) {
    state.torchOpacity = torchLevel;
    const opacity = torchLevel.toFixed(3);
    torchEl.style.opacity = opacity;
    torchGlowEl.style.opacity = opacity;
    torchRingEl.style.opacity = opacity;
  }

  for (const cell of cards) {
    if (still && cell.written) continue;

    const px = cell.left + marginX - state.x.cur;
    const py = cell.top + marginY - state.y.cur;
    const sx = px - Math.round((px - halfW) / maxX) * maxX;
    const sy = py - Math.round((py - halfH) / maxY) * maxY;

    const isFlipCard = flipActive && cell.id === state.flip.id;
    if (!isFlipCard) {
      if (sx + card < -pad || sx > w + pad || sy + card < -pad || sy > h + pad) {
        if (!cell.parked) {
          cell.el.style.transform = 'translate(-4000px,-4000px)';
          cell.parked = true;
        }
        continue;
      }
      cell.parked = false;
    }

    const q = [
      warp(sx - halfW, sy - halfH),
      warp(sx + card - halfW, sy - halfH),
      warp(sx - halfW, sy + card - halfH),
      warp(sx + card - halfW, sy + card - halfH),
    ];
    for (const p of q) {
      p.x += halfW;
      p.y += halfH;
    }

    if (flipActive && cell.id === state.flip.id && target) {
      const e = flipE;
      for (let i = 0; i < 4; i++) {
        q[i] = { x: lerp(q[i].x, target.q[i].x, e), y: lerp(q[i].y, target.q[i].y, e) };
      }
      const was = cell.el.classList.contains('flipped');
      if (e > 0.01) {
        if (!was) cell.el.classList.add('flipped');
        cell.el.style.setProperty('--slide', e.toFixed(3));
      } else {
        if (was) {
          cell.el.classList.remove('flipped');
          cell.el.style.setProperty('--slide', '0');
        }
      }
    } else if (cell.el.classList.contains('flipped')) {
      cell.el.classList.remove('flipped');
      cell.el.style.setProperty('--slide', '0');
    }

    const i0 = inset(q[0], q[1], q[2], GAP);
    const i1 = inset(q[1], q[0], q[3], GAP);
    const i2 = inset(q[2], q[0], q[3], GAP);
    const i3 = inset(q[3], q[1], q[2], GAP);

    const ox = cell.left;
    const oy = cell.top;
    cell.el.style.transform = matrix(
      card,
      { x: i0.x - ox, y: i0.y - oy },
      { x: i1.x - ox, y: i1.y - oy },
      { x: i2.x - ox, y: i2.y - oy },
      { x: i3.x - ox, y: i3.y - oy }
    );

    const ofx = clamp((sx + card / 2 - halfW) * 0.035, -18, 18);
    const ofy = clamp((sy + card / 2 - halfH) * 0.035, -18, 18);
    cell.img.style.transform = `scale(${IMG_BLEED}) translate(${ofx.toFixed(1)}px, ${ofy.toFixed(1)}px)`;

    cell.written = true;
  }
}

/* ---------------- 输入 ---------------- */
const onWheel = (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    setZoom(state.zoom * Math.exp(-e.deltaY * 0.0022));
    return;
  }
  state.x.tgt += e.deltaX * 1.2;
  state.y.tgt += e.deltaY * 1.2;
};

function pointerDistance() {
  const values = [...pointers.values()];
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

const onPointerDown = (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    state.drag = null;
    state.pinch = { dist: pointerDistance(), zoom: state.zoom };
    state.lastDragMoved = 999;
    return;
  }
  state.drag = {
    sx: e.clientX,
    sy: e.clientY,
    tx: state.x.tgt,
    ty: state.y.tgt,
    moved: 0,
  };
  state.press = { target: e.target, x: e.clientX, y: e.clientY };
  e.target.closest?.('.card')?.classList.add('pressed');
  state.vel = 0;
  state.lastPt = { x: e.clientX, y: e.clientY, t: performance.now() };
  stage.classList.add('dragging');
};

const onPointerMove = (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  state.raw.x = e.clientX - innerWidth / 2;
  state.raw.y = e.clientY - innerHeight / 2;
  if (state.pinch && pointers.size >= 2) {
    const dist = pointerDistance();
    if (dist > 0) {
      const ratio = dist / state.pinch.dist;
      if (Math.abs(ratio - 1) > 0.025) {
        setZoom(state.pinch.zoom * ratio);
        state.pinch.dist = dist;
        state.pinch.zoom = state.zoom;
      }
    }
    return;
  }
  const d = state.drag;
  if (!d) return;
  const nx = e.clientX;
  const ny = e.clientY;
  d.moved = Math.max(d.moved, Math.hypot(nx - d.sx, ny - d.sy));
  state.x.tgt = d.tx + (d.sx - nx);
  state.y.tgt = d.ty + (d.sy - ny);
  const now = performance.now();
  const last = state.lastPt || { x: nx, y: ny, t: now };
  state.vel = Math.hypot(nx - last.x, ny - last.y) / Math.max(now - last.t, 1);
  state.lastPt = { x: nx, y: ny, t: now };
};

function releasePointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) state.pinch = null;
  if (pointers.size < 1) {
    stage.classList.remove('dragging');
    for (const card of cards) card.el.classList.remove('pressed');
    state.lastDragMoved = state.drag ? state.drag.moved : state.lastDragMoved;
    if (state.press && state.lastDragMoved <= 8) handleCardPress(state.press.target);
    state.press = null;
    state.drag = null;
    state.lastPt = null;
  }
}

const onKeyDown = (e) => {
  const step = state.period;
  switch (e.code) {
    case 'ArrowLeft':
      state.x.tgt -= step;
      e.preventDefault();
      break;
    case 'ArrowRight':
      state.x.tgt += step;
      e.preventDefault();
      break;
    case 'ArrowUp':
      state.y.tgt -= step;
      e.preventDefault();
      break;
    case 'ArrowDown':
      state.y.tgt += step;
      e.preventDefault();
      break;
    case 'Space':
      if (!e.repeat) state.x.tgt += (e.shiftKey ? -1 : 1) * state.w * 0.8;
      e.preventDefault();
      break;
    case 'Escape':
      state.flip.tgt = 0;
      showStatus('详情已关闭');
      break;
    case 'Enter':
      if (document.activeElement?.classList.contains('card')) {
        handleCardPress(document.activeElement.querySelector('.media'));
        e.preventDefault();
      }
      break;
    case 'Digit0':
      setZoom(1);
      break;
    case 'KeyT':
      if (!e.repeat) setTorch(!state.torch);
      break;
    default:
      if (e.key === '+' || e.key === '=') {
        setZoom(state.zoom * 1.14);
        e.preventDefault();
      }
      if (e.key === '-' || e.key === '_') {
        setZoom(state.zoom / 1.14);
        e.preventDefault();
      }
  }
};

function handleCardPress(target) {
  const closeBtn = target.closest('.close');
  if (closeBtn) {
    state.flip.tgt = 0;
    showStatus('详情已关闭');
    return;
  }
  const cardEl = target.closest('.card');
  const mediaEl = target.closest('.media');
  if (!cardEl || !mediaEl) {
    state.flip.tgt = 0;
    return;
  }
  const cell = cards.find((c) => c.el === cardEl);
  if (!cell || cell.itemId < 0) return;
  if (state.flip.id === cell.id) {
    state.flip.tgt = 0;
    showStatus('详情已关闭');
    return;
  }
  state.flip.id = cell.id;
  state.flip.tgt = 1;
  showStatus(`${wallImages[cell.itemId].title} · 详情已打开`);
}

/* ---------------- 缩放 ---------------- */
function updateZoomUI() {
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  btnZoomIn.disabled = state.zoom >= MAX_ZOOM - 0.001;
  btnZoomOut.disabled = state.zoom <= MIN_ZOOM + 0.001;
  btnFit.classList.toggle('on', Math.abs(state.zoom - 1) < 0.001);
}

function setZoom(next) {
  const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
  if (Math.abs(z - state.zoom) < 0.001) return;
  state.zoom = z;
  state.flip = { id: -1, p: 0, tgt: 0 };
  state.x.cur = state.x.tgt = 0;
  state.y.cur = state.y.tgt = 0;
  build();
  updateZoomUI();
  showStatus(`缩放 ${Math.round(state.zoom * 100)}%`);
}

/* ---------------- UI ---------------- */
const onStageClick = (e) => {
  if (e.target.closest?.('.close')) handleCardPress(e.target);
};
const onTorchClick = () => setTorch(!state.torch);
const onResetClick = () => {
  state.x.tgt = 0;
  state.y.tgt = 0;
  state.flip.tgt = 0;
  showStatus('已回到照片墙中心');
};
const onZoomIn = () => setZoom(state.zoom * 1.14);
const onZoomOut = () => setZoom(state.zoom / 1.14);
const onFit = () => setZoom(1);

/* ---------------- 尺寸变化 ---------------- */
let resizeTimer = 0;
function scheduleResize() {
  const g = ++state.gen;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (g !== state.gen) return;
    state.flip.tgt = 0;
    state.flip = { id: -1, p: 0, tgt: 0 };
    build();
  }, 120);
}

function attachListeners() {
  if (attached || !stage || !btnTorch) return;
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('click', onStageClick);
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', releasePointer);
  stage.addEventListener('pointercancel', releasePointer);
  window.addEventListener('keydown', onKeyDown);
  btnTorch.addEventListener('click', onTorchClick);
  btnReset.addEventListener('click', onResetClick);
  btnZoomIn.addEventListener('click', onZoomIn);
  btnZoomOut.addEventListener('click', onZoomOut);
  btnFit.addEventListener('click', onFit);
  window.addEventListener('resize', scheduleResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
  attached = true;
}

function detachListeners() {
  if (!attached || !stage) return;
  stage.removeEventListener('wheel', onWheel);
  stage.removeEventListener('click', onStageClick);
  stage.removeEventListener('pointerdown', onPointerDown);
  stage.removeEventListener('pointermove', onPointerMove);
  stage.removeEventListener('pointerup', releasePointer);
  stage.removeEventListener('pointercancel', releasePointer);
  window.removeEventListener('keydown', onKeyDown);
  if (btnTorch) btnTorch.removeEventListener('click', onTorchClick);
  if (btnReset) btnReset.removeEventListener('click', onResetClick);
  if (btnZoomIn) btnZoomIn.removeEventListener('click', onZoomIn);
  if (btnZoomOut) btnZoomOut.removeEventListener('click', onZoomOut);
  if (btnFit) btnFit.removeEventListener('click', onFit);
  window.removeEventListener('resize', scheduleResize);
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', scheduleResize);
  attached = false;
}

/* ---------------- 生命周期 ---------------- */
export function initWall(images) {
  wallImages = Array.isArray(images) ? images : [];
  stage = document.getElementById('stage');
  gridEl = document.getElementById('grid');
  torchEl = document.getElementById('torch');
  torchGlowEl = document.getElementById('torch-glow');
  torchRingEl = document.getElementById('torch-ring');
  dimEl = document.getElementById('dim');
  coverEl = document.getElementById('cover');
  btnTorch = document.getElementById('btnTorch');
  btnReset = document.getElementById('btnReset');
  btnZoomIn = document.getElementById('btnZoomIn');
  btnZoomOut = document.getElementById('btnZoomOut');
  btnFit = document.getElementById('btnFit');
  zoomValue = document.getElementById('zoomValue');
  statusEl = document.getElementById('wallStatus');
  interactionHint = document.getElementById('interactionHint');
  if (!stage || !gridEl || !coverEl) return;

  for (const c of cards) c.el.remove();
  cards = [];
  deckOrder = [];
  cardSeq = 1;
  preloadStarted = false;
  coverEl.classList.remove('done');
  Object.assign(state, {
    gen: 0,
    zoom: 1,
    x: { cur: 0, tgt: 0 },
    y: { cur: 0, tgt: 0 },
    cursor: { x: 0, y: 0 },
    raw: { x: 0, y: 0 },
    vel: 0,
    lag: 0,
    drag: null,
    press: null,
    pinch: null,
    lastDragMoved: 0,
    torch: false,
    torchOpacity: -1,
    cardDimOpacity: -1,
    flip: { id: -1, p: 0, tgt: 0 },
    hole: 300,
    holeX: -1,
    holeY: -1,
    last: performance.now(),
  });
  resizeTimer = 0;

  if (!attached) attachListeners();
  build();
  updateZoomUI();
  setTimeout(() => interactionHint?.classList.add('hidden'), 5000);
  if (rafId) cancelAnimationFrame(rafId);
  const loop = () => {
    draw();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

export function destroyWall() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  clearTimeout(statusTimer);
  detachListeners();
  for (const c of cards) c.el.remove();
  cards = [];
  if (gridEl) gridEl.replaceChildren();
  if (coverEl) coverEl.classList.remove('done');
}
