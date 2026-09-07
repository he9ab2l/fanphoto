import { forwardRef, useId, useState, type ComponentProps, type ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Dialog } from '@base-ui/react/dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Select } from '@base-ui/react/select'
import { Switch } from '@base-ui/react/switch'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Icon, type IconName } from './icons'
export { Input, Radio, RadioGroup }
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
>(function IconButton({ icon, label, active, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn('icon-button', active && 'is-active', className)}
      {...props}
    >
      <Icon name={icon} />
    </Button>
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
      <Icon name="info" />
      <p>{error instanceof Error ? error.message : '加载失败，请重试'}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
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
export function SelectField({
  label,
  value,
  items,
  onChange,
  compact = false,
}: {
  label: string
  value: string
  items: { value: string; label: string }[]
  onChange: (value: string) => void
  compact?: boolean
}) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <div className={cn('select-field', compact && 'select-field--compact')}>
        <Select.Label className={compact ? 'sr-only' : 'field-label'}>{label}</Select.Label>
        <Select.Trigger className="select-trigger" aria-label={label}>
          <Select.Value />
          <Select.Icon>
            <Icon name="down" size={16} />
          </Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Positioner className="select-positioner" sideOffset={6}>
          <Select.Popup className="select-popup material">
            <Select.List>
              {items.map((item) => (
                <Select.Item className="select-item" value={item.value} key={item.value}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Icon name="check" size={17} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
export function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <label className="toggle-field" htmlFor={id}>
      <span>
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <Switch.Root id={id} className="switch" checked={checked} onCheckedChange={onChange}>
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
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
