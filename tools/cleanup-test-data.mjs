import { DatabaseSync } from 'node:sqlite'
import { readdir, stat, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

// Only our stopped, synthetic browser-test databases. Never the real data root.
const removed = []
for (const name of await readdir('/tmp')) {
  if (!/^fanphoto-browser-[A-Za-z0-9]{6}$/.test(name)) continue
  const directory = resolve('/tmp', name)
  const info = await stat(directory)
  if (info.uid !== process.getuid()) throw new Error(`Unexpected owner: ${directory}`)
  const db = new DatabaseSync(resolve(directory, 'library.sqlite'), { readOnly: true })
  try {
    const photos = db.prepare('SELECT source_name,exif FROM photos').all()
    if (!photos.every((photo) =>
      /^(synthetic-\d+|browser-upload(?:-(desktop|mobile))?)\.jpg$/.test(photo.source_name) &&
      JSON.parse(photo.exif).model === 'Synthetic Camera'))
      throw new Error(`Non-synthetic content in ${directory}, refusing cleanup`)
  } finally { db.close() }
  await rm(directory, { recursive: true, force: false })
  removed.push(directory)
}
console.log(JSON.stringify({ removedSyntheticTestDirectories: removed }))
