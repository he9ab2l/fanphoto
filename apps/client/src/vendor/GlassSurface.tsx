/**
 * Adapted from React Bits GlassSurface (0e69e73), David Haz.
 * Uses its CSS fallback as the cross-browser baseline. No RGB displacement,
 * moving blur, or generated filter maps over the photographs.
 * See NOTICE.md and react-bits-license.txt.
 */
import type { HTMLAttributes } from 'react'
export function GlassSurface({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-surface glass-surface--fallback ${className}`} {...props}>
      <div className="glass-surface__content">{children}</div>
    </div>
  )
}
