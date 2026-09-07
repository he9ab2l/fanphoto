import { readFile, writeFile } from 'node:fs/promises'
const manifest = JSON.parse(await readFile('test-photo/commons-landscapes/manifest.json', 'utf8'))
const label = (text) =>
  String(text)
    .replaceAll('|', '\\|')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('\n', ' ')
const rows = manifest.photos.map(
  (photo) =>
    `| [${label(photo.title)}](${photo.sourcePage}) | ${label(photo.author)} | ${photo.licenseUrl ? `[${photo.license}](${photo.licenseUrl})` : photo.license} | ${photo.width} × ${photo.height} | ${photo.group} |`,
)
await writeFile(
  'docs/photo-sources.md',
  [
    '# 测试照片来源',
    '',
    '从 Wikimedia Commons 下载的真实摄影原片，不是生成图片。原文件不改变字节，manifest.json 记录每份 SHA256；网页按原许可署名并链接来源。',
    '',
    '派生版本仅作方向校正、sRGB 转换、尺寸缩放、WebP 编码与隐私元数据移除；适用的 CC BY-SA 条件继续保留。未编造任何拍摄参数。',
    '',
    '| 作品 / 来源 | 作者 | 许可 | 原始尺寸 | 比例分类 |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `共 ${manifest.photos.length} 张。原片总量 ${(manifest.photos.reduce((sum, photo) => sum + photo.bytes, 0) / 1024 ** 2).toFixed(1)} MiB。`,
    '完整证据：test-photo/commons-landscapes/manifest.json；服务端处理复核：artifacts/photo-audit/report.json。',
    '',
  ].join('\n'),
)
console.log(`Recorded ${rows.length} photographs with attribution and license links`)
