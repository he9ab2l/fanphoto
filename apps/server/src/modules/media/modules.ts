import type { Exif } from '@fanphoto/contracts'

export interface MediaModule {
  namespace: string
  version: number
  prepare: (context: {
    photoId: string
    preview: Readonly<Uint8Array>
    source: { mime: string; width: number; height: number; bytes: number }
    exif: Readonly<Exif>
    hasAlpha: boolean
    colorSpace: string
  }) => Promise<Record<string, unknown> | null>
}
export const builtinModules: MediaModule[] = [
  {
    namespace: 'core.file',
    version: 1,
    async prepare({ source, hasAlpha, colorSpace }) {
      return { ...source, hasAlpha, colorSpace, processor: 'sharp' }
    },
  },
]
export function validateModules(modules: MediaModule[]) {
  const names = new Set<string>()
  for (const module of modules) {
    if (
      !/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(module.namespace) ||
      names.has(module.namespace) ||
      !Number.isInteger(module.version) ||
      module.version < 1
    )
      throw new Error(`Invalid media module: ${module.namespace}`)
    names.add(module.namespace)
  }
  return modules
}
