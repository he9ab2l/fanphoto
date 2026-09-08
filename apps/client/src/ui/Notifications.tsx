import { Toaster } from 'sonner'
import { usePreferences } from '../lib/preferences'
import { Icon } from './icons'

export default function Notifications() {
  const { resolvedTheme } = usePreferences()
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      style={{ zIndex: 'var(--layer-toast)' }}
      icons={{
        success: <Icon name="check" />,
        error: <Icon name="error" />,
        info: <Icon name="info" />,
        warning: <Icon name="warning" />,
        loading: <Icon name="refresh" className="spin" />,
      }}
    />
  )
}
