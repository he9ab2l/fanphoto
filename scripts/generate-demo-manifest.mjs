/**
 * 生成 demo/no-gl-grid/images.js：
 * 扫描 test-photo（跳过 exif-corpus 子目录），输出窗口内照片清单。
 * 用法：node scripts/generate-demo-manifest.mjs
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const srcDir = join(root, 'test-photo');
const outDir = join(root, 'demo', 'no-gl-grid');
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const SKIP_DIRS = new Set(['exif-corpus']);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, acc);
    } else if (EXTS.has(extname(e.name).toLowerCase())) {
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(srcDir).sort((a, b) => a.localeCompare(b, 'zh-CN'));
const items = files.map((p) => ({
  src: encodeURI(relative(outDir, p).replaceAll('\\', '/')),
  title: basename(p, extname(p)),
}));

writeFileSync(join(outDir, 'images.js'), 'window.IMAGES = ' + JSON.stringify(items, null, 2) + ';\n');
console.log('wrote images.js with ' + items.length + ' images');