// Admin redesign — shared components: unsaved-changes guard.
//
// 28 Nov 2026 — useBlocker REMOVED: it crashed the Track editor.
// `useBlocker` only works inside a data router (createBrowserRouter /
// RouterProvider). This app uses <BrowserRouter> (App.jsx), so the
// hook THREW "useBlocker must be used within a data router" on every
// editor mount — the editor never rendered, for new and existing
// tracks alike (live repro 28 Nov 2026; the public track page was
// fine because it never mounts this hook). Do NOT reintroduce
// useBlocker — or any data-router-only hook (useFetcher, useSubmit,
// useLoaderData, useActionData, useRouteLoaderData, useRevalidator)
// — without migrating the app to a data router first. The regression
// test src/admin/__tests__/trackEditor.test.js fails if the editor's
// mount throws again.
//
// Protection now — there is no supported way to block in-app
// navigation in a <BrowserRouter> app, so the in-app "Leave without
// saving?" dialog is gone and the guard is loss-prevention instead:
//  1. beforeunload — refresh / tab close while dirty.
//  2. Autosave (TrackEditor, every 10s while dirty) + the unmount-save
//     below — leaving the page, in-app or otherwise, persists the
//     draft to localStorage, and the editor offers to restore it on
//     return (maybeOfferDraft + ConfirmDialog in TrackEditor).
// The { UnsavedGuard } API is kept (it renders nothing) so TrackEditor
// needs no structural change.
import { useEffect, useRef } from 'react'
import { draftKey, serializeDraft } from '../lib/trackEditorSteps.js'

export function useUnsavedGuard(dirty, draftId, formRefLatest) {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

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

  // Unmount-save: the autosave ticks every 10s, so edits typed in
  // the last few seconds before leaving would otherwise be lost.
  // Saves the outgoing draft when the editor unmounts or the user
  // moves to another track's editor (draftId change) while dirty.
  // Best-effort — storage full / blocked must never break navigation.
  // The ref reads the latest dirty flag at cleanup time, so a save
  // that cleared the flag does not re-save a stale draft.
  useEffect(
    () => () => {
      if (!dirtyRef.current || !draftId || !formRefLatest) return
      try {
        localStorage.setItem(draftKey(draftId), serializeDraft(formRefLatest.current))
      } catch {
        // Storage unavailable — the draft is a convenience, not the save.
      }
    },
    [draftId, formRefLatest],
  )

  // No in-app dialog anymore (see header) — kept for the call site.
  function UnsavedGuard() {
    return null
  }

  return { UnsavedGuard }
}
