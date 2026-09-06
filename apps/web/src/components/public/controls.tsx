import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Icon } from '../../lib/icons'

interface GlassIconButtonProps {
  label: string
  icon: string
  active?: boolean
  disabled?: boolean
  className?: string
  onClick?: () => void
}

export function GlassIconButton({
  label,
  icon,
  active,
  disabled,
  className = '',
  onClick,
}: GlassIconButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className={`liquid icon-btn ${active ? 'is-active' : ''} ${className}`}
      onClick={onClick}
    >
      <Icon icon={`mingcute:${icon}`} width={19} height={19} />
    </motion.button>
  )
}

interface GlassButtonProps {
  icon?: string
  children?: ReactNode
  disabled?: boolean
  className?: string
  onClick?: () => void
}

export function GlassButton({
  icon,
  children,
  disabled,
  className = '',
  onClick,
}: GlassButtonProps) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className={`liquid pill-btn ${className}`}
      onClick={onClick}
    >
      {icon && <Icon icon={`mingcute:${icon}`} width={17} height={17} />}
      {children}
    </motion.button>
  )
}
