// 真实渲染 QA：连接本地无头 Chrome，抓取演示截图 + 收集 JS 错误
import { writeFileSync } from 'node:fs';

const URL = process.env.QA_URL || process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || (import.meta.dirname + '/../apps/web/_qa');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id) {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXC: ' + (d.exception?.description || d.text || 'unknown'));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('CONSOLE: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('saved', `${OUT}-${name}.png`);
};
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result?.value;
};
const mouseClick = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
};
const clickCard = async (index = -1) => {
  const pt = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.photo-card')];
    const el = ${index} >= 0 ? cards[${index}] : cards.find((card) => {
      const r = card.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return x > innerWidth * 0.25 && x < innerWidth * 0.75 && y > 120 && y < innerHeight - 120 && document.elementFromPoint(x, y)?.closest('.photo-card') === card;
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!pt) throw new Error(`no clickable photo-card[${index}]`);
  await mouseClick(pt.x, pt.y);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(5000);
await shot('grid');
const uniqueSrcs = await evalJs(`new Set([...document.querySelectorAll('.photo-card img')].map((i) => i.getAttribute('src'))).size`);
console.log('unique images:', uniqueSrcs);
const loaded = await evalJs(`[...document.querySelectorAll('.photo-card img')].filter((i) => i.complete && i.naturalWidth > 0).length`);
console.log('loaded images:', loaded);

// 效果切换：验证穹顶透镜进入动画状态并保持交互。
await send('Runtime.evaluate', { expression: `document.querySelector('.effect-option[aria-label="穹顶透镜"]').click()` });
await sleep(700);
const effectState = await evalJs(`({ active: document.querySelector('.effect-option.is-active')?.getAttribute('aria-label'), matrix: document.querySelectorAll('.photo-card[style*="matrix3d"]').length })`);
console.log('effect state:', JSON.stringify(effectState));
if (effectState.active !== '穹顶透镜') throw new Error('effect switch failed');

// 轻点照片：验证 pointer capture 后仍能打开独立查看器。
await clickCard();
await sleep(700);
const viewerState = await evalJs(`({ open: document.querySelectorAll('.photo-viewer').length, title: document.querySelector('#viewer-title')?.textContent })`);
console.log('viewer state:', JSON.stringify(viewerState));
if (viewerState.open !== 1) throw new Error('viewer did not open');
await shot('viewer');

// 验证查看器键盘切换和 Escape 关闭。
await send('Runtime.evaluate', { expression: `document.querySelector('.detail-navigation button[aria-label="下一张照片"]').focus()` });
await send('Runtime.evaluate', { expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))` });
await sleep(300);
await send('Runtime.evaluate', { expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))` });
await sleep(400);
const viewerClosed = await evalJs(`document.querySelectorAll('.photo-viewer').length === 0`);
if (!viewerClosed) throw new Error('viewer did not close');

// 手电筒模式下点击照片仍应打开查看器。
await send('Runtime.evaluate', { expression: `document.querySelector('.control-btn[aria-label="手电筒"]').click()` });
await sleep(300);
const target = await evalJs(`(() => { const cards = [...document.querySelectorAll('.photo-card')]; for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (r.left > 40 && r.right < innerWidth - 40 && r.top > 80 && r.bottom < innerHeight - 80) return i; } return -1; })()`);
if (target < 0) throw new Error('no visible photo card');
await clickCard(target);
await sleep(500);
const torchState = await evalJs(`({ viewer: document.querySelectorAll('.photo-viewer').length, torch: document.querySelector('.gallery-shell').classList.contains('has-torch') })`);
console.log('torch click state:', JSON.stringify(torchState));
if (torchState.viewer !== 1 || !torchState.torch) throw new Error('torch interaction failed');
await shot('torch-viewer');
await send('Runtime.evaluate', { expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))` });
await sleep(300);

// 缩放坞：放大后再一键适配回 100%。
await send('Runtime.evaluate', { expression: `document.querySelector('.dock-btn[aria-label="放大"]').click()` });
await sleep(400);
const z1 = await evalJs(`document.querySelector('.zoom-value').textContent`);
await send('Runtime.evaluate', { expression: `document.querySelector('.dock-btn[aria-label="适配屏幕"]').click()` });
await sleep(400);
const z2 = await evalJs(`document.querySelector('.zoom-value').textContent`);
console.log('zoom:', z1, '->', z2);
if (z1 === z2 || z2 !== '100%') throw new Error('zoom controls failed');

// 移动端尺寸：验证容器重排、图片加载与查看器不溢出。
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: URL });
await sleep(3000);
const mobileState = await evalJs(`({ cards: document.querySelectorAll('.photo-card').length, coverDone: document.querySelector('.loading-cover').classList.contains('is-done'), bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth })`);
console.log('mobile state:', JSON.stringify(mobileState));
if (!mobileState.cards || !mobileState.coverDone || mobileState.bodyWidth > mobileState.viewportWidth) throw new Error('mobile layout failed');
await clickCard();
await sleep(400);
const mobileViewer = await evalJs(`(() => { const el = document.querySelector('.detail-content'); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; })()`);
if (!mobileViewer || mobileViewer.left < 0 || mobileViewer.right > mobileViewer.width) throw new Error('mobile viewer overflow');
await shot('mobile-viewer');

console.log('JS errors:', errors.length ? errors.join('\n') : 'none');
await send('Browser.close').catch(() => {});
process.exit(errors.length ? 1 : 0);
