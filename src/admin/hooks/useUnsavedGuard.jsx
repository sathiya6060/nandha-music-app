// Admin redesign — shared components: unsaved-changes guard.
//
// Usage in a section page:
//   const { UnsavedGuard } = useUnsavedGuard(dirty)
//   ...
//   <UnsavedGuard />
//
// While dirty, in-app navigation is blocked by react-router's
// useBlocker and answered with the shared ConfirmDialog; leaving
// the tab/window is caught by beforeunload. When not dirty it
// renders nothing and never blocks.
//
// The Confirm button reads "Leave without saving"
// (admin.unsavedLeave): it leaves the page, discarding the edits.
import { useEffect, useMemo } from 'react'
import { useBlocker } from 'react-router-dom'
import { useI18n } from '../../lib/i18n.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export function useUnsavedGuard(dirty) {
  const { t } = useI18n()
  const blocker = useBlocker(dirty)

  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      // Setting returnValue is what actually triggers the browser's
      // leave-page prompt; preventDefault alone is not enough.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // The guard component is memoised on the blocker (useBlocker
  // returns a stable object until the navigation state changes), so
  // its identity — and the open dialog — survives parent re-renders
  // while the user types. It changes exactly when the block starts,
  // which is when the dialog appears.
  const UnsavedGuard = useMemo(() => {
    function Guard() {
      if (!blocker || blocker.state !== 'blocked') return null
      return (
        <ConfirmDialog
          open
          title={t('admin.unsavedTitle')}
          body={t('admin.unsavedBody')}
          confirmLabel={t('admin.unsavedLeave')}
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )
    }
    return Guard
  }, [blocker, t])

  return { UnsavedGuard }
}
