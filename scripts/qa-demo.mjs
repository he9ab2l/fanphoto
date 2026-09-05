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
const clickCard = async (index) => {
  const pt = await evalJs(`(() => { const el = document.querySelectorAll('.card')[${index}]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error(`no card[${index}]`);
  await mouseClick(pt.x, pt.y);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(5000);
await shot('grid');
const uniqueSrcs = await evalJs(`new Set([...document.querySelectorAll('.card img')].map((i) => i.getAttribute('src'))).size`);
console.log('unique images:', uniqueSrcs);
const loaded = await evalJs(`[...document.querySelectorAll('.card img')].filter((i) => i.complete && i.naturalWidth > 0).length`);
console.log('loaded images:', loaded);

// 轻点照片：验证 pointer capture 后点击仍能打开翻转
await clickCard(3);
await sleep(1800);
await shot('flip');

await send('Runtime.evaluate', { expression: `document.getElementById('btnTorch').click()` });
await sleep(700);
await shot('flip-torch');

// 手电筒开启时关闭翻转，再点另一张可见卡片：验证点击在手电筒模式下可用
await send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))` });
await sleep(1200);
const target = await evalJs(`(() => { const cards = [...document.querySelectorAll('.card')]; for (let i = 0; i < cards.length; i++) { const c = cards[i]; if (c.classList.contains('flipped')) continue; const r = c.getBoundingClientRect(); if (r.right > innerWidth / 2 && r.left < innerWidth - 40 && r.bottom > 40 && r.top < innerHeight - 40) return i; } return -1; })()`);
if (target < 0) throw new Error('no visible card');
await clickCard(target);
await sleep(1800);
const st = await evalJs(`({ flipped: document.querySelectorAll('.card.flipped').length, dim: document.getElementById('dim').style.opacity, torchOp: document.getElementById('torch').style.opacity })`);
console.log('torch-click state:', JSON.stringify(st));
await shot('torch-click-flip');

// 缩放坞：放大后再一键适配回 100%
await send('Runtime.evaluate', { expression: `document.getElementById('btnZoomIn').click()` });
await sleep(700);
const z1 = await evalJs(`document.getElementById('zoomValue').textContent`);
await send('Runtime.evaluate', { expression: `document.getElementById('btnFit').click()` });
await sleep(700);
const z2 = await evalJs(`document.getElementById('zoomValue').textContent`);
console.log('zoom:', z1, '->', z2);

console.log('JS errors:', errors.length ? errors.join('\n') : 'none');
await send('Browser.close').catch(() => {});
process.exit(errors.length ? 1 : 0);
