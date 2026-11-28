// Shared ordered-track editor regression test (28 Nov 2026).
//
// The Albums / Playlists ordered-track editing (toggle with
// remove-confirm, reorder, remove) was extracted from the two pages
// into useOrderedTracks + AdminTrackOrderEditor. This file renders
// that shared code through a small harness and guards the behaviour
// the pages relied on: adding a track, moving it up/down, the
// remove-confirm (toggle on an included track must NOT drop it), and
// the confirmed removal. jsdom is a devDependency for these render
// tests; nothing about it ships to the browser.
import { describe, it, expect } from 'vitest'
import { installDom } from '../../lib/__tests__/testHelpers.js'

const TRACKS = [
  { id: 'a', titleTa: 'Alpha Ta', titleEn: 'Alpha', artist: 'Nandha Music' },
  { id: 'b', titleTa: 'Beta Ta', titleEn: 'Beta', artist: 'Nandha Music' },
  { id: 'c', titleTa: 'Gamma Ta', titleEn: 'Gamma', artist: 'Nandha Music' },
]

async function renderHarness() {
  installDom('https://nandhamusic.pages.dev/admin/albums')
  const { createElement: h, act, useState } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useOrderedTracks } = await import('../lib/useEditorForm.js')
  const { AdminTrackOrderEditor } = await import('../components/AdminList.jsx')

  const apiRef = { current: null }
  const confirms = []
  function Harness() {
    const [form, setForm] = useState({ trackIds: ['a'] })
    const api = useOrderedTracks({
      form,
      setForm,
      setConfirmState: (state) => confirms.push(state),
    })
    apiRef.current = api
    const orderedTracks = form.trackIds
      .map((id) => TRACKS.find((tr) => tr.id === id))
      .filter(Boolean)
    const unselectedTracks = TRACKS.filter((tr) => !form.trackIds.includes(tr.id))
    return h(AdminTrackOrderEditor, {
      t: (k) => k,
      orderedTracks,
      unselectedTracks,
      onMove: api.moveTrack,
      onToggle: api.toggleTrack,
    })
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(h(Harness))
  })
  return {
    container,
    act,
    apiRef,
    confirms,
    orderedNames: () =>
      [...container.querySelectorAll('.admin-order-item')].map((li) => li.textContent),
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function clickButton(container, act, text, index = 0) {
  const buttons = [...container.querySelectorAll('button')].filter((b) =>
    b.textContent.includes(text),
  )
  return act(async () => {
    buttons[index].click()
  })
}

describe('useOrderedTracks + AdminTrackOrderEditor', () => {
  it('adds a track from the picker, reorders it, and confirms before removing', async () => {
    const rendered = await renderHarness()
    try {
      expect(rendered.orderedNames()).toHaveLength(1)
      expect(rendered.orderedNames()[0]).toContain('Alpha Ta')
      // Add Beta from the unselected grid.
      const betaBox = [...rendered.container.querySelectorAll('.admin-checkbox-grid input')].find(
        (input) => input.closest('label').textContent.includes('Beta Ta'),
      )
      await rendered.act(async () => {
        betaBox.click()
      })
      expect(rendered.orderedNames()).toHaveLength(2)
      expect(rendered.orderedNames()[1]).toContain('Beta Ta')
      // Move Alpha down: Beta first, Alpha second.
      await clickButton(rendered.container, rendered.act, 'common.moveDown', 0)
      expect(rendered.orderedNames()[0]).toContain('Beta Ta')
      expect(rendered.orderedNames()[1]).toContain('Alpha Ta')
      // Move Beta back up with the second item's move-up.
      await clickButton(rendered.container, rendered.act, 'common.moveUp', 1)
      expect(rendered.orderedNames()[0]).toContain('Alpha Ta')
      // Remove asks for confirmation first — the track stays listed.
      await clickButton(rendered.container, rendered.act, 'common.remove', 0)
      expect(rendered.confirms).toEqual([{ kind: 'removeTrack', trackId: 'a' }])
      expect(rendered.orderedNames()).toHaveLength(2)
      // The confirmed removal (what the page's dialog calls) drops it.
      await rendered.act(async () => {
        rendered.apiRef.current.doRemoveTrack('a')
      })
      expect(rendered.orderedNames()).toHaveLength(1)
      expect(rendered.orderedNames()[0]).toContain('Beta Ta')
    } finally {
      await rendered.cleanup()
    }
  })

  it('toggling an unselected track adds it; toggling an included one confirms', async () => {
    const rendered = await renderHarness()
    try {
      await rendered.act(async () => {
        rendered.apiRef.current.toggleTrack('c')
      })
      expect(rendered.orderedNames()).toHaveLength(2)
      expect(rendered.orderedNames()[1]).toContain('Gamma Ta')
      await rendered.act(async () => {
        rendered.apiRef.current.toggleTrack('c')
      })
      expect(rendered.confirms).toEqual([{ kind: 'removeTrack', trackId: 'c' }])
      expect(rendered.orderedNames()).toHaveLength(2)
    } finally {
      await rendered.cleanup()
    }
  })
})
