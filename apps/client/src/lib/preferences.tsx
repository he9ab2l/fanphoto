import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
export type Theme = 'system' | 'light' | 'dark'
interface Preferences {
  theme: Theme
  density: number
}
const key = 'fanphoto.preferences'
function read(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return {
      theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
      density: [1, 2, 3].includes(value.density) ? value.density : 2,
    }
  } catch {
    return { theme: 'system', density: 2 }
  }
}
const Context = createContext<{
  preferences: Preferences
  setPreferences: (next: Partial<Preferences>) => void
  resolvedTheme: 'light' | 'dark'
} | null>(null)
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, set] = useState(read)
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const resolvedTheme =
    preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(media.matches)
    const storage = (event: StorageEvent) => {
      if (event.key === key) set(read())
    }
    media.addEventListener('change', change)
    window.addEventListener('storage', storage)
    return () => {
      media.removeEventListener('change', change)
      window.removeEventListener('storage', storage)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#101010' : '#f5f5f5')
  }, [resolvedTheme])
  return (
    <Context.Provider
      value={{
        preferences,
        resolvedTheme,
        setPreferences: (next) =>
          set((previous) => {
            const updated = { ...previous, ...next }
            try {
              localStorage.setItem(key, JSON.stringify(updated))
            } catch {
              /* private browsing can disable storage */
            }
            return updated
          }),
      }}
    >
      {children}
    </Context.Provider>
  )
}
export const usePreferences = () => {
  const value = useContext(Context)
  if (!value) throw new Error('Preferences provider is missing')
  return value
}
