import { useId } from 'react'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import { Switch } from '@base-ui/react/switch'
import { cn } from './primitives'
import { Icon } from './icons'
export { Input }

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
