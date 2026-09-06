import { spawn } from 'node:child_process'
import { mkdir, rename, writeFile } from 'node:fs/promises'
const root = '/home/ubuntu/fanphoto-dev'
const originFile = `${root}/data/public-origin`
await mkdir(`${root}/data`, { recursive: true, mode: 0o700 })
let lastOrigin = '', pending = Promise.resolve(), stopping = false
const child = spawn(`${root}/bin/cloudflared`, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8787', '--protocol', 'http2', '--metrics', '127.0.0.1:20247'], { stdio: ['ignore', 'pipe', 'pipe'] })
function processLine(line) {
  process.stdout.write(line + '\n')
  const match = line.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)\b/)
  if (!match || match[0] === lastOrigin) return
  lastOrigin = match[0]
  pending = pending.then(async () => {
    const temporary = `${originFile}.next`
    await writeFile(temporary, `${lastOrigin}\n`, { mode: 0o600 })
    await rename(temporary, originFile)
    console.log(`Fanphoto development URL: ${lastOrigin}`)
  }).catch((error) => { console.error('Could not publish development origin:', error.message); child.kill('SIGTERM') })
}
for (const stream of [child.stdout, child.stderr]) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => { buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop(); for (const line of lines) processLine(line) })
}
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', async (code) => { await pending; process.exit(stopping ? 0 : code || 1) })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; child.kill(signal) })
