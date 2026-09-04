/* =====================================================================
 * no-GL 无限照片墙 · 演示实现
 * 零依赖：wrap(取模) → warp(枕形+光标凸起) → inset(恒缝隙) → homography(matrix3d)
 * 参考 docs/no-gl-grid-skill.md
 * ===================================================================== */
(() => {
'use strict';

/* ---------------- 可调参数（对应 skill 的 Tunables） ---------------- */
const BOW = 0.06;           // 枕形弯曲：边缘扩张 1 + BOW（小值：弯曲温和，不露黑边）
const BULGE = 0.16;         // 光标透镜强度（小值：推挤不产生明显缝隙）
const REACH = 1.5;          // 透镜半径（以 period 为单位）
const FLIP = 0.7;           // 翻转卡片尺寸 = FLIP × 视口短边
const DAMP_PAN = 0.1;       // 平移阻尼
const DAMP_FLIP = 0.12;     // 翻转阻尼
const DAMP_CURSOR = 0.16;   // 光标阻尼
const SHADE = 0.55;         // 翻转时背景压暗
const GAP = 12;             // 卡片缝隙（px）
const RADIUS = 12;          // 圆角（px）
const IMG_BLEED = 1.1;      // 图片视差出血量（≥ 最大漂移）
const FLIP_MARGIN = 0.11;   // 翻转区上下留白比例
const CARD_TARGET = 330;    // 目标卡片宽度（px）
const PANEL_RATIO = 0.30;
const PANEL_GAP = 8;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.3;

const VER = '2026.09';

const stage = document.getElementById('stage');
const gridEl = document.getElementById('grid');
const torchEl = document.getElementById('torch');
const torchGlowEl = document.getElementById('torch-glow');
const torchRingEl = document.getElementById('torch-ring');
const dimEl = document.getElementById('dim');
const coverEl = document.getElementById('cover');
const btnTorch = document.getElementById('btnTorch');
const btnReset = document.getElementById('btnReset');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnFit = document.getElementById('btnFit');
const zoomValue = document.getElementById('zoomValue');

const images = Array.isArray(window.IMAGES) ? window.IMAGES : [];

/* ---------------- 状态 ---------------- */
const state = {
  gen: 0,
  w: 0, h: 0, card: 320, period: 336,
  cols: 2, rows: 2,
  zoom: 1,
  x: { cur: 0, tgt: 0 },
  y: { cur: 0, tgt: 0 },
  cursor: { x: 0, y: 0 },
  raw: { x: 0, y: 0 },
  vel: 0, lag: 0,
  drag: null,
  press: null,
  pinch: null,
  lastDragMoved: 0,
  torch: false,
  torchOpacity: -1,
  cardDimOpacity: -1,
  flip: { id: -1, p: 0, tgt: 0 },
  hole: 300,
  holeX: -1, holeY: -1,
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
const damp = (from, to, rate, dt) =>
  from + (to - from) * (1 - Math.pow(1 - rate, dt));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (m) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// 枕形弯曲 + 光标高斯凸起（返回视口中心系坐标）
const warp = (px, py) => {
  const halfW = state.w / 2, halfH = state.h / 2;
  const nx = px / halfW, ny = py / halfH;
  const f = 1 + BOW * (nx * nx + ny * ny);
  let wx = px * f, wy = py * f;
  const dx = wx - state.cursor.x, dy = wy - state.cursor.y;
  const calm = 1 / (1 + state.lag / 40);   // 平移时透镜弱化
  const reach2 = REACH * REACH * state.period * state.period;
  const push = BULGE * calm * Math.exp(-(dx * dx + dy * dy) / reach2);
  return { x: wx + dx * push, y: wy + dy * push };
};

// 沿两条邻边各内缩 gap/2 —— 相邻卡片共享格点与边线，缝隙恒定
const inset = (p, a, b, g) => {
  const d = g / 2;
  const la = Math.hypot(a.x - p.x, a.y - p.y) || 1;
  const lb = Math.hypot(b.x - p.x, b.y - p.y) || 1;
  const e1x = (a.x - p.x) / la, e1y = (a.y - p.y) / la;
  const e2x = (b.x - p.x) / lb, e2y = (b.y - p.y) / lb;
  return { x: p.x + (e1x + e2x) * d, y: p.y + (e1y + e2y) * d };
};

// 矩形 → 任意四边形 homography，单次 matrix3d（transform-origin: top left）
const matrix = (w, q0, q1, q2, q3) => {
  const dx1 = q1.x - q3.x, dy1 = q1.y - q3.y;
  const dx2 = q2.x - q3.x, dy2 = q2.y - q3.y;
  const sx = q0.x - q1.x - q2.x + q3.x;
  const sy = q0.y - q1.y - q2.y + q3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const h = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = q1.x - q0.x + g * q1.x, b = q2.x - q0.x + h * q2.x;
  const d = q1.y - q0.y + g * q1.y, e = q2.y - q0.y + h * q2.y;
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
  if (deckOrder.length !== images.length) {
    deckOrder = shuffle(Array.from({ length: images.length }, (_, i) => i));
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

  // +2 是承重细节：换行卡片翻越边缘前需在两侧各留至少一个整格
  const cols = state.cols + 2;
  const rows = state.rows + 2;

  gridEl.style.setProperty('--card', state.card + 'px');
  gridEl.style.setProperty('--gap', GAP + 'px');
  gridEl.style.setProperty('--r', RADIUS + 'px');
  gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--card))`;
  gridEl.style.gridAutoRows = 'var(--card)';

  const n = images.length;
  const order = getDeckOrder();
  const fallback = n ? `共 ${n} 张照片` : '暂无照片';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const imgIdx = n ? order[(r * 7 + c * 13) % n] : -1;
      const item = n ? images[imgIdx] : null;
      const title = item ? item.title : '空';
      const el = document.createElement('figure');
      el.className = 'card';
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
          `<p class="p-desc">高清照片 · 个人摄影档案</p>` +
          `<div class="meta"><span>${n} 张</span><span>${VER}</span></div>` +
        `</aside>`;
      const img = el.querySelector('img');
      if (item) img.src = item.src;
      img.addEventListener('error', () => el.querySelector('.media').classList.add('broken'));
      gridEl.appendChild(el);
      cards.push({
        el, img, id, itemId: imgIdx,
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
  const unique = [...new Set(images.map((i) => i.src))];
  if (!unique.length) { revealCover(); return; }
  let settled = 0;
  const done = () => { if (++settled >= unique.length) revealCover(); };
  for (const src of unique) {
    const im = new Image();
    im.decoding = 'async';
    im.onload = done;
    im.onerror = done;
    im.src = src;
  }
  setTimeout(revealCover, 4500);   // 慢网兜底
}
function revealCover() {
  if (!coverEl.classList.contains('done')) coverEl.classList.add('done');
}


function buildTorchMask() {
  if (!torchEl) return;
  const hole = clamp(Math.min(state.w, state.h) * 0.30, 140, 420);
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

  // 阻尼（帧率无关）
  state.x.cur = damp(state.x.cur, state.x.tgt, DAMP_PAN, dt);
  state.y.cur = damp(state.y.cur, state.y.tgt, DAMP_PAN, dt);
  state.cursor.x = damp(state.cursor.x, state.raw.x, DAMP_CURSOR, dt);
  state.cursor.y = damp(state.cursor.y, state.raw.y, DAMP_CURSOR, dt);
  state.lag = lerp(state.lag, state.vel, 0.07);
  state.flip.p = damp(state.flip.p, state.flip.tgt, DAMP_FLIP, dt);

  const { w, h, card } = state;
  const halfW = w / 2, halfH = h / 2;
  const maxX = (state.cols + 2) * state.period;
  const maxY = (state.rows + 2) * state.period;
  const marginX = (w - maxX) / 2;  // 网格大于视口时为负，正好把网格中心对齐到视口中心
  const marginY = (h - maxY) / 2;
  const pad = state.period;

  const flipE = smooth(clamp(state.flip.p, 0, 1));
  const flipActive = state.flip.id >= 0;

  // 背景压暗（翻转时）
  const shadeLevel = SHADE * flipE;
  if (Math.abs(shadeLevel - state.cardDimOpacity) > 0.004) {
    state.cardDimOpacity = shadeLevel;
    const opacity = shadeLevel.toFixed(3);
    dimEl.style.opacity = opacity;
    for (const cell of cards) cell.dim.style.opacity = cell.id === state.flip.id ? '0' : opacity;
  }

  // 翻转目标：居中方形 + 下方信息面板（竖排布局）
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

  // 静止检测：全停时跳过所有写入
  const still =
    Math.abs(state.x.cur - state.x.tgt) < 0.01 &&
    Math.abs(state.y.cur - state.y.tgt) < 0.01 &&
    Math.abs(state.flip.p - state.flip.tgt) < 0.0005 &&
    Math.abs(state.cursor.x - state.raw.x) < 0.05 &&
    Math.abs(state.cursor.y - state.raw.y) < 0.05;

  updateTorch();

  // 手电筒在翻转打开时整体淡出：主角卡片与面板保持清晰
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

    // 取“离视口最近的等价位置”：盒子大于视口时，wrap 到 [0,max) 会把
    // 本该在视口左/上缘的卡片甩到周期末端（整体偏向右下角）。按距离取整修正。
    const px = cell.left + marginX - state.x.cur;
    const py = cell.top + marginY - state.y.cur;
    const sx = px - Math.round((px - halfW) / maxX) * maxX;
    const sy = py - Math.round((py - halfH) / maxY) * maxY;

    // 被翻转的卡片不参与停车：即使离屏也持续绘制（翻转目标在视口中心）
    const isFlipCard = flipActive && cell.id === state.flip.id;
    if (!isFlipCard) {
      if (sx + card < -pad || sx > w + pad || sy + card < -pad || sy > h + pad) {
        if (!cell.parked) {          // 一次停车写入，之后完全跳过
          cell.el.style.transform = 'translate(-4000px,-4000px)';
          cell.parked = true;
        }
        continue;
      }
      cell.parked = false;
    }

    // 1) 四个角：格点坐标 → wrap → warp（视口中心系）
    const q = [
      warp(sx - halfW, sy - halfH),
      warp(sx + card - halfW, sy - halfH),
      warp(sx - halfW, sy + card - halfH),
      warp(sx + card - halfW, sy + card - halfH),
    ];
    for (const p of q) { p.x += halfW; p.y += halfH; }

    // 2) 翻转：角点向居中方形 lerp（同一 inset + homography 管线）
    if (flipActive && cell.id === state.flip.id && target) {
      const e = flipE;
      for (let i = 0; i < 4; i++) {
        q[i] = { x: lerp(q[i].x, target.q[i].x, e), y: lerp(q[i].y, target.q[i].y, e) };
      }
      const was = cell.el.classList.contains('flipped');
      if (e > 0.01) {
        if (!was) cell.el.classList.add('flipped');
        cell.el.style.setProperty('--slide', e.toFixed(3));   // 仅 1 张卡片每帧写 CSS 变量（单卡子树，允许）
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

    // 3) 内缩 gap/2，缝隙恒定的弯曲网格
    const i0 = inset(q[0], q[1], q[2], GAP);
    const i1 = inset(q[1], q[0], q[3], GAP);
    const i2 = inset(q[2], q[0], q[3], GAP);
    const i3 = inset(q[3], q[1], q[2], GAP);

    // 4) 一次 matrix3d（角点是屏幕坐标，需减去卡片在 CSS grid 流中的原点）
    const ox = cell.left, oy = cell.top;
    cell.el.style.transform = matrix(card,
      { x: i0.x - ox, y: i0.y - oy },
      { x: i1.x - ox, y: i1.y - oy },
      { x: i2.x - ox, y: i2.y - oy },
      { x: i3.x - ox, y: i3.y - oy });

    // 图片视差：scale 出血 1.1，反向微漂（直接写 transform，不布局不重绘）
    const ofx = clamp((sx + card / 2 - halfW) * 0.035, -18, 18);
    const ofy = clamp((sy + card / 2 - halfH) * 0.035, -18, 18);
    cell.img.style.transform = `scale(${IMG_BLEED}) translate(${ofx.toFixed(1)}px, ${ofy.toFixed(1)}px)`;

    cell.written = true;
  }
}

/* ---------------- 输入 ---------------- */
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    setZoom(state.zoom * Math.exp(-e.deltaY * 0.0022));
    return;
  }
  state.x.tgt += e.deltaX * 1.2;
  state.y.tgt += e.deltaY * 1.2;
}, { passive: false });

function pointerDistance() {
  const values = [...pointers.values()];
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

stage.addEventListener('pointerdown', (e) => {
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
    sx: e.clientX, sy: e.clientY,
    tx: state.x.tgt, ty: state.y.tgt,
    moved: 0,
  };
  state.press = { target: e.target, x: e.clientX, y: e.clientY };
  state.vel = 0;
  state.lastPt = { x: e.clientX, y: e.clientY, t: performance.now() };
  stage.classList.add('dragging');
});

stage.addEventListener('pointermove', (e) => {
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
  const nx = e.clientX, ny = e.clientY;
  d.moved = Math.max(d.moved, Math.hypot(nx - d.sx, ny - d.sy));
  state.x.tgt = d.tx + (d.sx - nx);
  state.y.tgt = d.ty + (d.sy - ny);
  const now = performance.now();
  const last = state.lastPt || { x: nx, y: ny, t: now };
  state.vel = Math.hypot(nx - last.x, ny - last.y) / Math.max(now - last.t, 1);
  state.lastPt = { x: nx, y: ny, t: now };
});

function releasePointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) state.pinch = null;
  if (pointers.size < 1) {
    stage.classList.remove('dragging');
    state.lastDragMoved = state.drag ? state.drag.moved : state.lastDragMoved;
    if (state.press && state.lastDragMoved <= 8) handleCardPress(state.press.target);
    state.press = null;
    state.drag = null;
    state.lastPt = null;
  }
}
stage.addEventListener('pointerup', releasePointer);
stage.addEventListener('pointercancel', (e) => releasePointer(e, false));

window.addEventListener('keydown', (e) => {
  const step = state.period;
  switch (e.code) {
    case 'ArrowLeft': state.x.tgt -= step; e.preventDefault(); break;
    case 'ArrowRight': state.x.tgt += step; e.preventDefault(); break;
    case 'ArrowUp': state.y.tgt -= step; e.preventDefault(); break;
    case 'ArrowDown': state.y.tgt += step; e.preventDefault(); break;
    case 'Space':
      if (!e.repeat) state.x.tgt += (e.shiftKey ? -1 : 1) * state.w * 0.8;
      e.preventDefault();
      break;
    case 'Escape': state.flip.tgt = 0; break;
    case 'Digit0': setZoom(1); break;
    case 'KeyT': if (!e.repeat) setTorch(!state.torch); break;
    default:
      if (e.key === '+' || e.key === '=') { setZoom(state.zoom * 1.14); e.preventDefault(); }
      if (e.key === '-' || e.key === '_') { setZoom(state.zoom / 1.14); e.preventDefault(); }
  }
});

function handleCardPress(target) {
  const closeBtn = target.closest('.close');
  if (closeBtn) { state.flip.tgt = 0; return; }
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
    return;
  }
  state.flip.id = cell.id;
  state.flip.tgt = 1;
}

/* ---------------- 缩放 ---------------- */
function updateZoomUI() {
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  btnZoomIn.disabled = state.zoom >= MAX_ZOOM - 0.001;
  btnZoomOut.disabled = state.zoom <= MIN_ZOOM + 0.001;
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
}

/* ---------------- UI ---------------- */
btnTorch.addEventListener('click', () => setTorch(!state.torch));
btnReset.addEventListener('click', () => {
  state.x.tgt = 0;
  state.y.tgt = 0;
  state.flip.tgt = 0;
});
btnZoomIn.addEventListener('click', () => setZoom(state.zoom * 1.14));
btnZoomOut.addEventListener('click', () => setZoom(state.zoom / 1.14));
btnFit.addEventListener('click', () => setZoom(1));

/* ---------------- 尺寸变化（代际守卫防交错） ---------------- */
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
window.addEventListener('resize', scheduleResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);

/* ---------------- 启动 ---------------- */
build();
updateZoomUI();
requestAnimationFrame(function loop() {
  draw();
  requestAnimationFrame(loop);
});

})();
