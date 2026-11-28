// Shared admin list scaffolding (28 Nov 2026) — the four admin list
// pages (Tracks, Playlists, Albums, Artists) shared ~100-180
// duplicated lines each: page head, error notice, toolbar, bulk bar,
// skeleton, empty state, table shell, mobile cards, pagination and the
// delete dialogs. These components are a line-for-line extraction;
// each page keeps its own columns, rows, filters, editor forms and row
// actions. No UI redesign, no behaviour change — class names,
// aria attributes, roles and button order are identical to the pages'.
import { LIST_PAGE_SIZES } from '../lib/listUtils.js'
import ConfirmDialog from './ConfirmDialog.jsx'

export function AdminPageHead({ title, subtitle, newLabel, onNew }) {
  return (
    <div className="admin-page-head">
      <div>
        <h1 className="admin-title">{title}</h1>
        <p className="admin-subtitle">{subtitle}</p>
      </div>
      <button type="button" className="admin-btn admin-btn-primary" onClick={onNew}>
        {newLabel}
      </button>
    </div>
  )
}

export function AdminErrorNotice({ error, role = 'alert', retryLabel, onRetry }) {
  if (!error) return null
  return (
    <div className="admin-notice admin-notice-warn" role={role} aria-live="polite">
      {error}
      <button
        type="button"
        className="admin-btn admin-btn-small"
        onClick={onRetry}
        style={{ marginLeft: 12 }}
      >
        {retryLabel}
      </button>
    </div>
  )
}

export function AdminToolbar({ t, list, searchPlaceholder, searchLabel, children }) {
  return (
    <div className="admin-toolbar">
      <input
        type="search"
        className="admin-input admin-search"
        placeholder={searchPlaceholder}
        value={list.search}
        onChange={(e) => {
          list.setSearch(e.target.value)
          list.setPage(1)
        }}
        aria-label={searchLabel}
      />
      {children}
      <label className="list-page-size">
        {t('admin.rowsPerPage')}
        <select
          className="admin-input"
          value={list.pageSize}
          onChange={(e) => {
            list.setPageSize(Number(e.target.value))
            list.setPage(1)
          }}
          aria-label={t('admin.rowsPerPage')}
        >
          {LIST_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function AdminBulkBar({ t, list, children }) {
  if (list.selected.size === 0) return null
  return (
    <div className="admin-bulkbar">
      <span>{t('admin.selectedCount', { count: list.selected.size })}</span>
      {children ?? (
        <>
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-danger"
            onClick={() => list.setConfirmState({ kind: 'bulkDelete' })}
          >
            {t('admin.bulkDelete')}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-ghost"
            onClick={() => list.clearSelection()}
          >
            {t('common.cancel')}
          </button>
        </>
      )}
    </div>
  )
}

// The loading / empty / rows switch is identical in all four pages
// (only the loading flag and the empty-state copy differ). The page
// keeps its own columns, rows and cards as children. `empty` groups
// the empty-state copy so the call sites stay short.
export function AdminListContent({ t, list, loading, empty, children }) {
  if (loading) return <AdminSkeleton label={t('admin.loadingRows')} />
  if (list.pageRows.length === 0) {
    return (
      <AdminEmpty
        title={empty.title}
        hint={empty.hint}
        actionLabel={empty.actionLabel}
        onAction={empty.onAction}
      />
    )
  }
  return <>{children}</>
}

// The first two table columns are the same shape on every list page
// (a cover/photo column, then the sortable name/title column); only
// the labels and the sort key differ.
export function AdminFirstColumns({ list, coverLabel, sortKey, sortLabel }) {
  return (
    <>
      <th scope="col">{coverLabel}</th>
      <th scope="col" aria-sort={list.ariaSort(sortKey)}>{list.sortHeader(sortKey, sortLabel)}</th>
    </>
  )
}

// The Edit + Delete row actions are identical in the table rows and
// the mobile cards of Albums / Playlists / Artists (Tracks has its
// own restore / unpublish actions and keeps them).
export function AdminRowActions({ t, onEdit, onDelete }) {
  return (
    <div className="admin-row-actions">
      <button type="button" className="admin-btn admin-btn-small" onClick={onEdit}>
        {t('common.edit')}
      </button>
      <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={onDelete}>
        {t('common.delete')}
      </button>
    </div>
  )
}

// The Save + Cancel buttons at the foot of an editor form (only the
// save label differs per page).
export function AdminFormActions({ t, saveLabel, onCancel }) {
  return (
    <div className="admin-form-actions">
      <button type="submit" className="admin-btn admin-btn-primary">
        {saveLabel}
      </button>
      <button type="button" className="admin-btn admin-btn-ghost" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </div>
  )
}

// The ordered-track editor plus its Save / Cancel buttons — one
// form section in the Albums and Playlists editors (the form itself
// stays in the page; this is only the shared tail of it).
export function AdminTrackOrderForm({
  t,
  orderedTracks,
  unselectedTracks,
  onMove,
  onToggle,
  saveLabel,
  onCancel,
}) {
  return (
    <>
      <AdminTrackOrderEditor
        t={t}
        orderedTracks={orderedTracks}
        unselectedTracks={unselectedTracks}
        onMove={onMove}
        onToggle={onToggle}
      />
      <AdminFormActions t={t} saveLabel={saveLabel} onCancel={onCancel} />
    </>
  )
}

// The remove-track confirm dialog shared by the Albums and Playlists
// editors: removing a track from the list is destructive (L33), so
// the toggle opens this confirm and only the confirmed removal calls
// onRemoveTrack. `tracks` is the page's track list (for the title).
export function AdminRemoveTrackDialog({ t, list, tracks, onRemoveTrack }) {
  const trackId = list.confirmState?.trackId
  const track = tracks.find((tr) => tr.id === trackId)
  return (
    <ConfirmDialog
      open={list.confirmState?.kind === 'removeTrack'}
      title={t('admin.confirmRemoveTrack', { title: track?.titleTa || track?.titleEn || trackId || '' })}
      body={t('admin.deleteNoUndo')}
      confirmLabel={t('common.remove')}
      danger
      onConfirm={() => {
        list.setConfirmState(null)
        onRemoveTrack(trackId)
      }}
      onCancel={() => list.setConfirmState(null)}
    />
  )
}
export function AdminTrackOrderEditor({ t, orderedTracks, unselectedTracks, onMove, onToggle }) {
  return (
    <>
      <h3 className="admin-section-title">{t('admin.trackOrder')}</h3>
      {orderedTracks.length === 0 ? (
        <p className="admin-muted">{t('admin.noTracksInList')}</p>
      ) : (
        <ol className="admin-order-list">
          {orderedTracks.map((tr, i) => (
            <li key={tr.id} className="admin-order-item">
              <span>
                {i + 1}. {tr.titleTa || tr.titleEn}
              </span>
              <span className="admin-order-actions">
                <button type="button" className="admin-btn admin-btn-small" disabled={i === 0} onClick={() => onMove(i, -1)}>
                  {t('common.moveUp')}
                </button>
                <button type="button" className="admin-btn admin-btn-small" disabled={i === orderedTracks.length - 1} onClick={() => onMove(i, 1)}>
                  {t('common.moveDown')}
                </button>
                <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => onToggle(tr.id)}>
                  {t('common.remove')}
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <h3 className="admin-section-title">{t('admin.addTracks')}</h3>
      <div className="admin-checkbox-grid">
        {unselectedTracks.map((tr) => (
          <label key={tr.id} className="admin-check-label">
            <input type="checkbox" checked={false} onChange={() => onToggle(tr.id)} />
            {tr.titleTa || tr.titleEn} <span className="admin-muted">({tr.artist || '—'})</span>
          </label>
        ))}
      </div>
    </>
  )
}

export function AdminSkeleton({ label }) {
  return (
    <div className="list-skeleton" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="list-skeleton-row" />
      ))}
    </div>
  )
}

export function AdminEmpty({ title, hint, actionLabel, onAction }) {
  return (
    <div className="admin-empty">
      <h2>{title}</h2>
      <p>{hint}</p>
      <button type="button" className="admin-btn admin-btn-primary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

export function AdminTable({ list, selectAllLabel, columns, children }) {
  return (
    <div className="admin-table-wrap list-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">
              <input
                type="checkbox"
                checked={list.pageRows.length > 0 && list.pageRows.every((row) => list.selected.has(row.id))}
                onChange={list.toggleSelectPage}
                aria-label={selectAllLabel}
              />
            </th>
            {columns}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function AdminCards({ children }) {
  return <div className="list-cards">{children}</div>
}

export function AdminCard({ thumb, title, sub, meta, menuLabel, children }) {
  return (
    <article className="list-card">
      {thumb}
      <div className="list-card-body">
        <span className="list-card-title">{title}</span>
        <span className="list-card-sub">{sub}</span>
        <span className="list-card-meta">{meta}</span>
      </div>
      <details className="list-card-menu">
        <summary aria-label={menuLabel}>⋯</summary>
        <div className="list-card-menu-actions">{children}</div>
      </details>
    </article>
  )
}

export function AdminPagination({ t, list, show = true }) {
  if (!show) return null
  return (
    <div className="admin-pagination">
      <button
        type="button"
        className="admin-btn admin-btn-small"
        disabled={list.currentPage <= 1}
        onClick={() => list.setPage(list.currentPage - 1)}
      >
        {t('common.previous')}
      </button>
      <span>{t('common.pageOf', { page: list.currentPage, total: list.pageCount })}</span>
      <button
        type="button"
        className="admin-btn admin-btn-small"
        disabled={list.currentPage >= list.pageCount}
        onClick={() => list.setPage(list.currentPage + 1)}
      >
        {t('common.next')}
      </button>
    </div>
  )
}

// The delete + bulk-delete dialogs are identical in all four pages
// (only the delete title/body/type-name differ, supplied by the page
// from list.confirmState). The page's onConfirmDelete receives the
// item stored under confirmState.item; onConfirmBulkDelete is the
// page's bulk-delete wrapper.
export function AdminDeleteDialogs({
  t,
  list,
  deleteTitle,
  deleteBody,
  requireTypeName,
  onConfirmDelete,
  onConfirmBulkDelete,
}) {
  return (
    <>
      <ConfirmDialog
        open={list.confirmState?.kind === 'delete'}
        title={deleteTitle}
        body={deleteBody}
        confirmLabel={t('common.delete')}
        danger
        requireTypeName={requireTypeName}
        onConfirm={() => {
          const item = list.confirmState?.item
          list.setConfirmState(null)
          onConfirmDelete(item)
        }}
        onCancel={() => list.setConfirmState(null)}
      />
      <ConfirmDialog
        open={list.confirmState?.kind === 'bulkDelete'}
        title={t('admin.bulkDelete')}
        body={t('admin.bulkDeleteConfirm', { count: list.selected.size })}
        confirmLabel={t('admin.bulkDelete')}
        danger
        onConfirm={() => {
          list.setConfirmState(null)
          onConfirmBulkDelete()
        }}
        onCancel={() => list.setConfirmState(null)}
      />
    </>
  )
}
