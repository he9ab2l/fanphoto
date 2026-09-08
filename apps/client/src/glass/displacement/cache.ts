/** LRU cache for rasterized lens fields and displacement data URLs.
 * Keys are `${width}:${height}:${radius}:${variant}`; bounded to avoid leaking
 * memory when many control surfaces resize. */
const MAX_ENTRIES = 24
const store = new Map<string, string>()

export function cachedOrCompute<T extends string>(
  key: string,
  compute: () => T,
): T | null {
  const cached = store.get(key) as T | undefined
  if (cached !== undefined) return cached
  const value = compute()
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!)
  store.set(key, value)
  return value
}

export const cacheSize = () => store.size
export const clearCache = () => store.clear()
export { MAX_ENTRIES }