// Shared admin list regression test (28 Nov 2026).
//
// The four admin list pages (Tracks, Playlists, Albums, Artists) were
// refactored onto the shared useAdminList hook + AdminList components.
// This file renders a minimal harness page through the REAL hook and
// components and guards the behaviour the pages relied on: search
// filtering, sort toggling, select-all / bulk bar, pagination, single
// delete (success + failure) and bulk delete. A behaviour change in
// the shared code fails here instead of silently breaking all four
// list pages. jsdom is a devDependency for these render tests; nothing
// about it ships to the browser.
import { describe, it, expect, vi } from 'vitest'
import { installDom, rowNames, findButton, setSearch } from '../../lib/__tests__/testHelpers.js'

// Mutable mock state: each test resets the recorded calls.
const mockAdmin = vi.hoisted(() => ({
  writesEnabled: true,
  deleted: [],
  toasts: [],
  activities: [],
  failDelete: false,
}))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseWritesEnabled: () => mockAdmin.writesEnabled,
  adminDeleteErrorMessage: () => 'delete failed',
}))

vi.mock('../../lib/adminStore.js', () => ({
  logActivity: (entry) => mockAdmin.activities.push(entry),
}))

vi.mock('../../lib/toast.jsx', () => ({
  useToast: () => (msg) => mockAdmin.toasts.push(msg),
}))

vi.mock('../../lib/i18n.js', () => ({
  useI18n: () => ({ t: (k) => k, lang: 'en' }),
}))

function resetMocks() {
  mockAdmin.writesEnabled = true
  mockAdmin.deleted = []
  mockAdmin.toasts = []
  mockAdmin.activities = []
  mockAdmin.failDelete = false
}

const ROWS = [
  { id: 'b', name: 'Beta', count: 2 },
  { id: 'a', name: 'Alpha', count: 10 },
  { id: 'g', name: 'Gamma', count: 1 },
]

async function renderHarness(rows = ROWS) {
  installDom('https://nandhamusic.pages.dev/admin/tracks')
  const { createElement: h, act, Fragment } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useAdminList } = await import('../lib/useAdminList.jsx')
  const {
    AdminToolbar,
    AdminBulkBar,
    AdminTable,
    AdminPagination,
    AdminDeleteDialogs,
  } = await import('../components/AdminList.jsx')
  const { useI18n } = await import('../../lib/i18n.js')

  let latestList = null
  const deleteFn = async (item) => {
    if (mockAdmin.failDelete) throw new Error('boom')
    mockAdmin.deleted.push(item.id)
  }

  function Harness() {
    const { t } = useI18n()
    const list = useAdminList({
      t,
      user: { email: 'admin@test' },
      isAdmin: true,
      showToast: (msg) => mockAdmin.toasts.push(msg),
      rows,
      searchFilter: (r, q) => !q || r.name.toLowerCase().includes(q),
      sortValue: (r, key) => (key === 'count' ? r.count : r.name),
      sortKind: (key) => (key === 'count' ? 'number' : 'text'),
      initialSort: { key: 'name', dir: 'asc' },
      bumpVersion: () => {},
    })
    latestList = list
    return h(
      'div',
      null,
      h(AdminToolbar, { t, list, searchPlaceholder: 'search', searchLabel: 'search' }),
      h(
        AdminBulkBar,
        { t, list },
        h(
          'button',
          {
            type: 'button',
            onClick: () => list.setConfirmState({ kind: 'bulkDelete' }),
          },
          'bulkDeleteBtn',
        ),
      ),
      h(
        AdminTable,
        {
          list,
          selectAllLabel: 'all',
          columns: h(
            Fragment,
            null,
            h('th', { scope: 'col' }, list.sortHeader('name', 'Name')),
            h('th', { scope: 'col' }, list.sortHeader('count', 'Count')),
          ),
        },
        list.pageRows.map((r) =>
          h(
            'tr',
            { key: r.id },
            h(
              'td',
              null,
              h('input', {
                type: 'checkbox',
                checked: list.selected.has(r.id),
                onChange: () => list.toggleSelect(r.id),
                'aria-label': r.name,
              }),
            ),
            h('td', null, r.name),
            h('td', null, String(r.count)),
          ),
        ),
      ),
      h(AdminPagination, { t, list }),
      h(AdminDeleteDialogs, {
        t,
        list,
        deleteTitle: 'confirmDelete',
        deleteBody: 'deleteNoUndo',
        onConfirmDelete: (item) =>
          list.deleteOne({ item, label: item.name, deleteFn, activity: 'Deleted' }),
        onConfirmBulkDelete: () =>
          list.deleteSelected({
            items: rows,
            getLabel: (r) => r.name,
            deleteFn,
            activity: 'Bulk deleted',
            bulkUnit: 'row(s)',
          }),
      }),
      list.error ? h('div', { role: 'alert' }, list.error) : null,
    )
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(h(Harness))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return {
    container,
    act,
    get list() {
      return latestList
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('useAdminList + AdminList', () => {
  it('filters rows by search and toggles sort direction', async () => {
    resetMocks()
    const rendered = await renderHarness()
    try {
      expect(rowNames(rendered.container, 2)).toEqual(['Alpha', 'Beta', 'Gamma'])
      await setSearch(rendered.container, rendered.act, 'alp')
      expect(rowNames(rendered.container, 2)).toEqual(['Alpha'])
      await setSearch(rendered.container, rendered.act, '')
      expect(rowNames(rendered.container, 2)).toEqual(['Alpha', 'Beta', 'Gamma'])
      // Sort header toggles asc -> desc.
      await rendered.act(async () => {
        findButton(rendered.container, 'Name').click()
      })
      expect(rowNames(rendered.container, 2)).toEqual(['Gamma', 'Beta', 'Alpha'])
    } finally {
      await rendered.cleanup()
    }
  })

  it('select-all shows the bulk bar; pagination advances', async () => {
    resetMocks()
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `row-${i + 1}`,
      name: `Row ${String(i + 1).padStart(2, '0')}`,
      count: i + 1,
    }))
    const rendered = await renderHarness(many)
    try {
      expect(rowNames(rendered.container, 2)).toHaveLength(25)
      expect(rendered.container.textContent).not.toContain('admin.selectedCount')
      await rendered.act(async () => {
        rendered.container.querySelector('thead input[type="checkbox"]').click()
      })
      expect(rendered.container.textContent).toContain('admin.selectedCount')
      expect(rendered.list.selected.size).toBe(25)
      await rendered.act(async () => {
        findButton(rendered.container, 'common.next').click()
      })
      expect(rowNames(rendered.container, 2)).toHaveLength(5)
      expect(rowNames(rendered.container, 2)[0]).toBe('Row 26')
    } finally {
      await rendered.cleanup()
    }
  })

  it('single delete calls the delete function and toasts', async () => {
    resetMocks()
    const rendered = await renderHarness()
    try {
      // Select the row first: a successful delete must also drop it
      // from the selection.
      await rendered.act(async () => {
        rendered.list.toggleSelect('a')
      })
      expect(rendered.list.selected.has('a')).toBe(true)
      await rendered.act(async () => {
        rendered.list.setConfirmState({ kind: 'delete', item: ROWS[1] })
      })
      expect(rendered.container.textContent).toContain('confirmDelete')
      await rendered.act(async () => {
        findButton(rendered.container, 'common.delete').click()
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(mockAdmin.deleted).toEqual(['a'])
      expect(mockAdmin.toasts).toContain('admin.itemDeleted')
      expect(mockAdmin.activities[0]?.action).toBe('Deleted')
      expect(rendered.list.selected.has('a')).toBe(false)
      // The harness passes static rows, so the row itself stays
      // rendered here — the real pages re-read their merged list
      // (refetch / version bump) after a delete.
    } finally {
      await rendered.cleanup()
    }
  })

  it('a failing delete shows the error and keeps the row', async () => {
    resetMocks()
    mockAdmin.failDelete = true
    const rendered = await renderHarness()
    try {
      await rendered.act(async () => {
        rendered.list.setConfirmState({ kind: 'delete', item: ROWS[1] })
      })
      await rendered.act(async () => {
        findButton(rendered.container, 'common.delete').click()
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(mockAdmin.deleted).toEqual([])
      expect(rendered.container.textContent).toContain('delete failed')
      expect(rowNames(rendered.container, 2)).toContain('Alpha')
    } finally {
      await rendered.cleanup()
    }
  })

  it('bulk delete deletes the whole selection', async () => {
    resetMocks()
    const rendered = await renderHarness()
    try {
      await rendered.act(async () => {
        rendered.list.toggleSelect('a')
        rendered.list.toggleSelect('g')
      })
      expect(rendered.container.textContent).toContain('admin.selectedCount')
      await rendered.act(async () => {
        findButton(rendered.container, 'bulkDeleteBtn').click()
      })
      await rendered.act(async () => {
        findButton(rendered.container, 'admin.bulkDelete').click()
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(mockAdmin.deleted).toEqual(['a', 'g'])
      expect(mockAdmin.toasts).toContain('admin.bulkDeleteResult')
      expect(rendered.list.selected.size).toBe(0)
      // The harness passes static rows, so the rows stay rendered
      // here — the real pages re-read their merged list (refetch /
      // version bump) after a delete.
    } finally {
      await rendered.cleanup()
    }
  })

  it('AdminListContent switches loading / empty / rows', async () => {
    installDom('https://nandhamusic.pages.dev/admin/tracks')
    const { createElement: h, act } = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { AdminListContent } = await import('../components/AdminList.jsx')
    const t = (k) => k
    const render = async (props) => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      await act(async () => {
        root.render(h(AdminListContent, { t, ...props }, h('div', { id: 'rows' }, 'row-body')))
      })
      return {
        container,
        cleanup: async () => {
          await act(async () => {
            root.unmount()
          })
          container.remove()
        },
      }
    }
    // Loading wins over empty rows.
    const loading = await render({
      list: { pageRows: [] },
      loading: true,
      empty: { title: 'emptyTitle', hint: 'emptyHint', actionLabel: 'emptyAction', onAction: () => {} },
    })
    try {
      expect(loading.container.querySelectorAll('.list-skeleton-row')).toHaveLength(5)
      expect(loading.container.querySelector('#rows')).toBeNull()
    } finally {
      await loading.cleanup()
    }
    // No rows and not loading: the empty state.
    const empty = await render({
      list: { pageRows: [] },
      loading: false,
      empty: { title: 'emptyTitle', hint: 'emptyHint', actionLabel: 'emptyAction', onAction: () => {} },
    })
    try {
      expect(empty.container.textContent).toContain('emptyTitle')
      expect(empty.container.querySelector('#rows')).toBeNull()
    } finally {
      await empty.cleanup()
    }
    // Rows present: children render, no skeleton or empty state.
    const rows = await render({
      list: { pageRows: [{ id: 'a' }] },
      loading: false,
      empty: { title: 'emptyTitle', hint: 'emptyHint', actionLabel: 'emptyAction', onAction: () => {} },
    })
    try {
      expect(rows.container.querySelector('#rows')).toBeTruthy()
      expect(rows.container.textContent).not.toContain('emptyTitle')
    } finally {
      await rows.cleanup()
    }
  })
})
