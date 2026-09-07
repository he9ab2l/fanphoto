import { Slider } from '@base-ui/react/slider'
import { usePreferences, type Theme } from '../lib/preferences'
import { Radio, RadioGroup } from './primitives'
import { Icon, type IconName } from './icons'
export function Appearance() {
  const { preferences, setPreferences } = usePreferences()
  const themes: { value: Theme; label: string; icon: IconName }[] = [
    { value: 'light', label: '明亮', icon: 'sun' },
    { value: 'dark', label: '深色', icon: 'moon' },
    { value: 'system', label: '跟随系统', icon: 'system' },
  ]
  return (
    <div className="appearance">
      <p className="field-label">外观</p>
      <RadioGroup
        value={preferences.theme}
        onValueChange={(value) => setPreferences({ theme: value as Theme })}
        className="theme-options"
        aria-label="主题"
      >
        {themes.map((theme) => (
          <Radio.Root
            value={theme.value}
            className="theme-option"
            key={theme.value}
            aria-label={theme.label}
          >
            <Icon name={theme.icon} />
            <span>{theme.label}</span>
          </Radio.Root>
        ))}
      </RadioGroup>
      <div className="density-label">
        <span className="field-label">照片密度</span>
        <span>{['', '宽松', '适中', '紧凑'][preferences.density]}</span>
      </div>
      <Slider.Root
        min={1}
        max={3}
        step={1}
        value={preferences.density}
        onValueChange={(value) => setPreferences({ density: Number(value) })}
      >
        <Slider.Control className="slider-control">
          <Slider.Track className="slider-track">
            <Slider.Indicator className="slider-indicator" />
            <Slider.Thumb className="slider-thumb" aria-label="照片密度" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  )
}
