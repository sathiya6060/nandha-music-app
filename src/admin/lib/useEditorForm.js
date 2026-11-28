// Shared editor-form helpers for the admin list pages (28 Nov 2026).
//
// AlbumsAdmin and PlaylistsAdmin carried identical ordered-track-list
// editing (toggle / remove-with-confirm / reorder) and identical cover
// file handling; ArtistsAdmin's photo handling was the same code with
// different names. SonarQube flagged the copies as duplicated new code
// on PR #15, so they live here once. Line-for-line extractions — no
// behaviour change; the pages keep their own form state, only the
// shared mechanics move here.
import { useState } from 'react'

// Ordered trackIds inside an editor form (Albums / Playlists).
// `form` is the page's form state ({ trackIds: [...] }); `setForm` is
// its setter; `setConfirmState` is the page list's confirm opener
// (list.setConfirmState). Removing a track from the list is
// destructive (L33), so toggleTrack on an included track opens the
// remove-track confirm instead of dropping it — the page's
// ConfirmDialog then calls doRemoveTrack.
export function useOrderedTracks({ form, setForm, setConfirmState }) {
  const toggleTrack = (trackId) => {
    // L33: removing a track from the list is destructive — confirm it.
    if (form.trackIds.includes(trackId)) {
      setConfirmState({ kind: 'removeTrack', trackId })
      return
    }
    setForm((f) => ({
      ...f,
      trackIds: f.trackIds.includes(trackId)
        ? f.trackIds.filter((id) => id !== trackId)
        : [...f.trackIds, trackId],
    }))
  }

  const doRemoveTrack = (trackId) => {
    setForm((f) => ({ ...f, trackIds: f.trackIds.filter((id) => id !== trackId) }))
  }

  const moveTrack = (index, dir) => {
    setForm((f) => {
      const ids = [...f.trackIds]
      const target = index + dir
      if (target < 0 || target >= ids.length) return f
      ;[ids[index], ids[target]] = [ids[target], ids[index]]
      return { ...f, trackIds: ids }
    })
  }

  return { toggleTrack, doRemoveTrack, moveTrack }
}

// A single image file + its preview URL (Albums / Playlists cover,
// Artists photo). Picking a file revokes the previous blob URL so
// repeated picks do not leak object URLs. `setPreview` lets the page
// show the stored image when opening the editor; `reset` clears both
// for a fresh form.
export function useCoverFile() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')

  const onChange = (e) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(picked))
  }

  const reset = () => {
    setFile(null)
    setPreview('')
  }

  return { file, preview, onChange, setPreview, reset }
}
