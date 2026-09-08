import { forwardRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Tooltip } from '@base-ui/react/tooltip'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Icon, type IconName } from './icons'
export { Radio, RadioGroup }
export const cn = (...values: Parameters<typeof clsx>) => twMerge(clsx(...values))

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & {
  className?: string
  variant?: 'solid' | 'quiet' | 'outline'
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'quiet', ...props },
  ref,
) {
  return (
    <BaseButton
      ref={ref}
      type="button"
      className={cn('button', `button--${variant}`, className)}
      {...props}
    />
  )
})
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    icon: IconName
    label: string
    active?: boolean
  }
>(function IconButton({ icon, label, active, className, title, ...props }, ref) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            ref={ref}
            aria-label={label}
            aria-pressed={active}
            className={cn('icon-button', active && 'is-active', className)}
            {...props}
          />
        }
      >
        <Icon name={icon} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className="tooltip-positioner" sideOffset={8}>
          <Tooltip.Popup className="tooltip">{title || label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
})
export function Spinner({ label = '正在加载' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <Icon name="refresh" className="spin" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
export function EmptyState({
  title,
  detail,
  children,
}: {
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <Icon name="photo" size={32} />
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <Icon name="error" />
      <p>{error instanceof Error ? error.message : '加载失败，请重试'}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          <Icon name="refresh" size={17} />
          重试
        </Button>
      )}
    </div>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}
export function Modal({
  title,
  description,
  children,
  onClose,
  className,
}: {
  title: string
  description?: string
  children: ReactNode | ((close: () => void) => ReactNode)
  onClose: () => void
  className?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <Dialog.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(value) => {
        if (!value) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className={cn('modal material', className)}>
          <header className="modal-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && <Dialog.Description>{description}</Dialog.Description>}
            </div>
            <Dialog.Close render={<IconButton icon="close" label="关闭" />} />
          </header>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function Confirm({
  title,
  description,
  action,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  action: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const [open, setOpen] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState('')
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value)
      }}
      onOpenChangeComplete={(value) => {
        if (!value) onClose()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="modal-backdrop" />
        <AlertDialog.Popup className="modal confirm-modal material">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <AlertDialog.Close render={<Button disabled={pending}>取消</Button>} />
            <Button
              variant="solid"
              disabled={pending}
              onClick={async () => {
                setPending(true)
                try {
                  await onConfirm()
                  setOpen(false)
                } catch (error) {
                  setError((error as Error).message)
                  setPending(false)
                }
              }}
            >
              {pending ? <Spinner /> : action}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
