import { mkdir, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const directory = '/home/ubuntu/fanphoto-dev/bin'
const destination = `${directory}/cloudflared`
if (await access(destination).then(() => true).catch(() => false)) {
  console.log('Project cloudflared already exists; not replacing it.')
  process.exit(0)
}
const releaseResponse = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { headers: { 'User-Agent': 'fanphoto-development' } })
if (!releaseResponse.ok) throw new Error(`Release lookup failed: ${releaseResponse.status}`)
const release = await releaseResponse.json()
const asset = release.assets.find((value) => value.name === 'cloudflared-linux-amd64')
if (!asset?.digest?.startsWith('sha256:')) throw new Error('Publisher checksum is required before installation')
const response = await fetch(asset.browser_download_url)
if (!response.ok) throw new Error(`Download failed: ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
const checksum = createHash('sha256').update(bytes).digest('hex')
if (`sha256:${checksum}` !== asset.digest) throw new Error('cloudflared checksum mismatch')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(destination, bytes, { mode: 0o700, flag: 'wx' })
await writeFile(`${directory}/cloudflared-version.json`, JSON.stringify({ version: release.tag_name, sha256: checksum, source: asset.browser_download_url }, null, 2), { mode: 0o600, flag: 'wx' })
console.log(`Installed ${release.tag_name}; SHA-256 ${checksum}`)
