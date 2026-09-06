import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X, Check, AlertCircle, LoaderCircle, Image as ImageIcon, ArrowUpRight } from 'lucide-react'
export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
export function Spinner({ label = '正在加载' }: { label?: string }) {
  return (
    <span className="loading" role="status">
      <LoaderCircle size={20} className="spin" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
export function Empty({
  title = '还没有照片',
  detail,
  action,
}: {
  title?: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol glass">
        <ImageIcon size={30} strokeWidth={1.3} />
      </div>
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <p>{error instanceof Error ? error.message : '加载失败'}</p>
      {retry && (
        <button className="button glass" onClick={retry}>
          重试
        </button>
      )}
    </div>
  )
}
export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId()
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal glass ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-surface">
        <header className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </div>
    </dialog>
  )
}
export function Confirm({
  title,
  detail,
  confirmLabel = '确认',
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string
  detail: string
  confirmLabel?: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown>
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending) onClose()
      }}
      className="confirm-modal"
    >
      <p className="muted confirm-detail">{detail}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button glass" disabled={pending} onClick={onClose}>
          取消
        </button>
        <button
          className={`button ${danger ? 'danger' : 'primary'}`}
          disabled={pending}
          onClick={async () => {
            setPending(true)
            try {
              await onConfirm()
              onClose()
            } catch (e) {
              setError((e as Error).message)
              setPending(false)
            }
          }}
        >
          {pending ? <Spinner /> : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
type Toast = { id: number; text: string; error: boolean }
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastContext)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]),
    counter = useRef(0),
    timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
    },
    [],
  )
  const show = (text: string, error = false) => {
    const id = ++counter.current
    setItems((old) => [...old.slice(-2), { id, text, error }])
    timers.current.push(
      setTimeout(() => setItems((old) => old.filter((item) => item.id !== id)), 4200),
    )
  }
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              className={`toast glass ${item.error ? 'is-error' : ''}`}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {item.error ? <AlertCircle size={18} /> : <Check size={18} />}
              <span>{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
export function Switch({
  label,
  detail,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  detail?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="switch-row">
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch-track" aria-hidden="true">
        <span />
      </span>
    </label>
  )
}
export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="button glass">
      {children}
      <ArrowUpRight size={16} />
    </a>
  )
}
