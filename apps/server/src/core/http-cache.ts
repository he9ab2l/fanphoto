/** Respect explicit q=0 exclusions; choose the best available representation. */
export function acceptedEncodings(header = ''): ('br' | 'gzip')[] {
  const quality = new Map<string, number>()
  for (const entry of header.toLowerCase().split(',')) {
    const [name, ...parameters] = entry.trim().split(';')
    const q = parameters.find((value) => value.trim().startsWith('q='))
    const value = q ? Number(q.trim().slice(2)) : 1
    quality.set(name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0)
  }
  return (['br', 'gzip'] as const)
    .map((encoding) => ({ encoding, q: quality.get(encoding) ?? quality.get('*') ?? 0 }))
    .filter(({ q }) => q > 0 && q >= (quality.get('identity') ?? 0))
    .sort((a, b) => b.q - a.q)
    .map(({ encoding }) => encoding)
}

/** GET/HEAD If-None-Match uses weak comparison, including lists and '*'. */
export const matchesEtag = (header: string | undefined, tag: string) =>
  header?.split(',').some((value) => {
    const normalized = value.trim().replace(/^W\//, '')
    return normalized === '*' || normalized === tag.replace(/^W\//, '')
  }) ?? false
