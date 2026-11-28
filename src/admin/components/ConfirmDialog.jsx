// Admin redesign — shared components: styled confirm dialog.
//
// Replaces window.confirm / window.prompt for admin destructive
// actions. Focus moves into the dialog on open (Cancel by default,
// the type-input when requireTypeName is set), Tab cycles inside it,
// Esc cancels, and focus returns to the element that was focused
// before open. No window.confirm / window.prompt anywhere here.
import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../lib/i18n.js'
import './confirm-dialog.css'

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  requireTypeName = null,
  typePlaceholder,
  onConfirm,
  onCancel,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const bodyId = useId()
  const inputId = useId()
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const inputRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [typed, setTyped] = useState('')

  const confirmText = confirmLabel ?? t('common.delete')
  const cancelText = cancelLabel ?? t('common.cancel')
  const typePlaceholderText = typePlaceholder ?? t('admin.confirmTypePlaceholder')
  const canConfirm = requireTypeName == null || typed === requireTypeName

  // Latest callbacks, refreshed after every render (never read or
  // written during render): the Esc handler registered on open and
  // the button handlers below always call the newest one, and the
  // typed value is cleared by whichever path closes the dialog.
  const onCancelRef = useRef(onCancel)
  const onConfirmRef = useRef(onConfirm)
  useEffect(() => {
    onCancelRef.current = onCancel
    onConfirmRef.current = onConfirm
  })

  const handleCancel = () => {
    setTyped('')
    onCancelRef.current?.()
  }
  const handleConfirm = () => {
    if (!canConfirm) return
    setTyped('')
    onConfirmRef.current?.()
  }

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Focus into the dialog: the type-input for a typed confirmation,
    // otherwise Cancel (the safe default — Enter/Space on the focused
    // button must never be the destructive one).
    const target = requireTypeName ? inputRef.current : cancelRef.current
    target?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleCancel()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusables = [...root.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Focus returns to where the user was before the dialog opened.
      previousFocusRef.current?.focus?.()
    }
    // handleCancel is intentionally excluded: it closes over the
    // latest callbacks through refs, and re-registering the listener
    // on every parent render would re-focus the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requireTypeName])

  if (!open) return null

  return (
    <div className="confirm-dialog__overlay">
      <div
        ref={dialogRef}
        className="confirm-dialog__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className="confirm-dialog__title">{title}</h2>
        <div id={bodyId} className="confirm-dialog__body">{body}</div>
        {requireTypeName != null && (
          <div className="confirm-dialog__type">
            <label htmlFor={inputId} className="confirm-dialog__type-label">
              {t('admin.confirmTypeName', { name: requireTypeName })}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="confirm-dialog__type-input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={typePlaceholderText}
              autoComplete="off"
            />
          </div>
        )}
        <div className="confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            onClick={handleCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={
              danger
                ? 'confirm-dialog__button confirm-dialog__button--danger'
                : 'confirm-dialog__button confirm-dialog__button--confirm'
            }
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
