import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export function replaceFanPhoto(text) {
  const lines = text.split('\n')
  const matchers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*@fanphoto\s+host\s+test\.heabl\.xyz\s*$/.test(line))
  if (matchers.length !== 1) throw new Error('Expected exactly one FanPhoto host matcher')
  const start = matchers[0].index
  const matcher = matchers[0].line.trim().split(/\s/)[0]
  let opening = start + 1
  while (!lines[opening]?.trim()) opening++
  if (lines[opening]?.trim() !== `handle ${matcher} {`)
    throw new Error('Unexpected FanPhoto Caddy structure')
  let depth = 0,
    end = opening
  for (; end < lines.length; end++) {
    depth += (lines[end].match(/{/g) || []).length - (lines[end].match(/}/g) || []).length
    if (depth === 0) break
  }
  if (end >= lines.length) throw new Error('Unbalanced Caddy block')
  const beforeOutside = [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n')
  const block = [
    '\t@fanphoto host test.heabl.xyz',
    '\thandle @fanphoto {',
    '\t\tencode zstd gzip',
    '\t\trequest_body {',
    '\t\t\tmax_size 64MB',
    '\t\t}',
    '\t\theader {',
    '\t\t\tStrict-Transport-Security "max-age=604800"',
    '\t\t\t-Server',
    '\t\t}',
    '\t\treverse_proxy 127.0.0.1:8787',
    '\t}',
  ]
  lines.splice(start, end - start + 1, ...block)
  const afterOutside = [...lines.slice(0, start), ...lines.slice(start + block.length)].join('\n')
  if (beforeOutside !== afterOutside) throw new Error('Unrelated Caddy configuration changed')
  return {
    text: lines.join('\n'),
    preservedHash: createHash('sha256').update(beforeOutside).digest('hex'),
  }
}
if (process.argv[1]?.endsWith('caddy-config.mjs')) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output || input === output)
    throw new Error('Usage: node caddy-config.mjs INPUT OUTPUT')
  const result = replaceFanPhoto(await readFile(input, 'utf8'))
  await writeFile(output, result.text, { flag: 'wx', mode: 0o600 })
  console.log(`Unrelated Caddy configuration preserved: ${result.preservedHash}`)
}
