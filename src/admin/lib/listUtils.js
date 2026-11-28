// Admin redesign — lists: shared pure helpers + debounced search hook.
//
// Pure helpers (sortRows / paginateRows / pageCountFor / clampPage)
// are unit-tested in src/admin/lib/__tests__/listUtils.test.js.
// useDebouncedValue is a React hook — it cannot run in the node-only
// Vitest harness (no jsdom), so it is covered by lint + live checks.
import { useEffect, useState } from 'react'

export const LIST_PAGE_SIZES = [25, 50, 100]
export const DEFAULT_PAGE_SIZE = 25
export const SEARCH_DEBOUNCE_MS = 200

export function useDebouncedValue(value, delayMs = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' })
}

export function compareNumber(a, b) {
  return (Number(a) || 0) - (Number(b) || 0)
}

export function compareDate(a, b) {
  const ta = a ? Date.parse(a) : Number.NaN
  const tb = b ? Date.parse(b) : Number.NaN
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return ta - tb
}

const COMPARATORS = { text: compareText, number: compareNumber, date: compareDate }

/**
 * Stable sort of rows by one key.
 * getValue(row, key) returns the raw value; kind is 'text' | 'number' | 'date'.
 * direction is 'asc' | 'desc'. Rows with missing values sort last.
 */
export function sortRows(rows, key, direction = 'asc', getValue, kind = 'text') {
  if (!key) return [...rows]
  const compare = COMPARATORS[kind] || compareText
  const dir = direction === 'desc' ? -1 : 1
  const isMissing = (v) => v == null || v === ''
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const va = getValue(a.row, key)
      const vb = getValue(b.row, key)
      // Missing values always sort last, in either direction.
      if (isMissing(va) && isMissing(vb)) return a.index - b.index
      if (isMissing(va)) return 1
      if (isMissing(vb)) return -1
      const result = compare(va, vb)
      return result !== 0 ? result * dir : a.index - b.index
    })
    .map(({ row }) => row)
}

export function pageCountFor(total, pageSize) {
  return Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)))
}

export function clampPage(page, total, pageSize) {
  return Math.min(Math.max(1, Number(page) || 1), pageCountFor(total, pageSize))
}

export function paginateRows(rows, page, pageSize) {
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  const current = clampPage(page, rows.length, size)
  return rows.slice((current - 1) * size, current * size)
}
