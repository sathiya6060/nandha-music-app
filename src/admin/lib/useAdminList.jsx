// Shared list state machine for the admin list pages — Tracks,
// Playlists, Albums, Artists (28 Nov 2026).
//
// The four pages shared ~100-180 duplicated lines each (search / sort /
// page / selection state, sort headers, select-all, single + bulk
// delete). This hook owns that machinery; each page keeps its own data
// fetching, pre-filters, sort value functions, editor forms and row
// rendering. No behaviour change — a line-for-line extraction of what
// the pages did, verified by the admin-list render test.
//
// Contract: `rows` is the page's pre-filtered list (its own filters
// already applied, memoised by the page); `searchFilter(row, q)` and
// `sortValue(row, key)` / `sortKind(key)` only read row fields, so the
// memos below depend on [rows, debouncedSearch] / [visible, sort]
// exactly as the pages' own memos did. `deleteOne` / `deleteSelected`
// keep the pages' guard order (admin → clear error → Supabase write
// → activity log → optional refetch → toast → selection/version
// bookkeeping); the page supplies the delete function, the label, the
// activity action and an optional refetch. `bumpVersion` is the page's
// own version bump (its merged-data memo depends on that version) —
// passed in so the delete helpers can refresh the list the same way
// the pages did. Artists' dependent-count pre-step stays in the page
// — its handleDelete counts dependents before opening the dialog.
import { useMemo, useState } from 'react'
import {
  useDebouncedValue,
  sortRows,
  paginateRows,
  pageCountFor,
  clampPage,
} from './listUtils.js'
import {
  supabaseWritesEnabled,
  adminDeleteErrorMessage,
} from '../../lib/supabaseAdmin.js'
import { logActivity } from '../../lib/adminStore.js'

export function useAdminList({
  t,
  user,
  isAdmin,
  showToast,
  rows,
  searchFilter,
  sortValue,
  sortKind,
  initialSort,
  bumpVersion,
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState(initialSort)
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null)

  const debouncedSearch = useDebouncedValue(search)
  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return rows.filter((row) => searchFilter(row, q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, debouncedSearch])
  const sorted = useMemo(
    () => sortRows(visible, sort.key, sort.dir, sortValue, sortKind(sort.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, sort],
  )
  const pageCount = pageCountFor(sorted.length, pageSize)
  const currentPage = clampPage(page, sorted.length, pageSize)
  const pageRows = paginateRows(sorted, currentPage, pageSize)

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
    setPage(1)
  }
  const sortHeader = (key, label) => (
    <button
      type="button"
      className="list-sort-btn"
      onClick={() => toggleSort(key)}
      aria-label={`${label} — ${sort.key === key && sort.dir === 'desc' ? t('admin.sortDesc') : t('admin.sortAsc')}`}
    >
      {label}
      <span className="list-sort-arrow" aria-hidden="true">
        {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )
  // aria-sort value for a sortable <th> (identical to the pages').
  const ariaSort = (key) =>
    sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectPage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pageRows.every((row) => next.has(row.id))
      for (const row of pageRows) {
        if (allSelected) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())
  const removeFromSelection = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Single delete — the shared write path. `refetch` is optional:
  // Tracks/Playlists refetch before the toast, Albums/Artists do not.
  // `deleteOptions` is passed through (Artists passes
  // { confirmCascade: true }).
  const deleteOne = async ({ item, label, deleteFn, activity, refetch, deleteOptions }) => {
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return false
    }
    setError('')
    if (supabaseWritesEnabled()) {
      try {
        await deleteFn(item, deleteOptions)
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return false
      }
      logActivity({ actor: user?.email || 'Admin', action: activity, detail: label })
      if (refetch) await refetch()
      showToast(t('admin.itemDeleted', { title: label }))
      removeFromSelection(item.id)
      bumpVersion()
      return true
    }
    setError(t('admin.dbNotConnected'))
    return false
  }

  // Bulk delete — one dialog for the whole selection. Keeps going
  // through failures and reports per-item, exactly as the pages did.
  const deleteSelected = async ({
    items,
    getLabel,
    deleteFn,
    activity,
    bulkUnit,
    refetch,
    deleteOptions,
  }) => {
    if (selected.size === 0) return false
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return false
    }
    setError('')
    if (!supabaseWritesEnabled()) {
      setError(t('admin.dbNotConnected'))
      return false
    }
    let done = 0
    const failed = []
    for (const id of selected) {
      const item = items.find((row) => row.id === id)
      if (!item) {
        failed.push(id)
        continue
      }
      try {
        await deleteFn(item, deleteOptions)
        done += 1
      } catch {
        failed.push(getLabel(item))
      }
    }
    if (done > 0) {
      logActivity({ actor: user?.email || 'Admin', action: activity, detail: `${done} ${bulkUnit}` })
      if (refetch) await refetch()
      showToast(t('admin.bulkDeleteResult', { done, total: selected.size }))
    }
    if (failed.length > 0) {
      setError(t('admin.bulkDeleteFailed', { count: failed.length, titles: failed.join(', ') }))
    }
    clearSelection()
    bumpVersion()
    return done > 0
  }

  return {
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    sort,
    toggleSort,
    sortHeader,
    ariaSort,
    selected,
    setSelected,
    toggleSelect,
    toggleSelectPage,
    clearSelection,
    error,
    setError,
    confirmState,
    setConfirmState,
    bumpVersion,
    visible,
    sorted,
    pageRows,
    pageCount,
    currentPage,
    deleteOne,
    deleteSelected,
  }
}
