// Admin redesign — lists: unit tests for the pure list helpers.
import { describe, it, expect } from 'vitest'
import {
  LIST_PAGE_SIZES,
  compareText,
  compareNumber,
  compareDate,
  sortRows,
  pageCountFor,
  clampPage,
  paginateRows,
} from '../listUtils.js'

const getValue = (row, key) => row[key]

describe('compare helpers', () => {
  it('compareText is case-insensitive and handles missing values', () => {
    expect(compareText('b', 'A')).toBeGreaterThan(0)
    expect(compareText('a', 'A')).toBe(0)
    expect(compareText(null, 'a')).toBeLessThan(0)
    expect(compareText(undefined, undefined)).toBe(0)
  })

  it('compareNumber treats missing values as 0', () => {
    expect(compareNumber(10, 3)).toBeGreaterThan(0)
    expect(compareNumber(null, 5)).toBe(-5)
    expect(compareNumber('7', 7)).toBe(0)
  })

  it('compareDate orders ISO dates and puts missing dates last', () => {
    expect(compareDate('2026-01-02', '2026-01-01')).toBeGreaterThan(0)
    expect(compareDate(null, '2026-01-01')).toBeGreaterThan(0)
    expect(compareDate('2026-01-01', null)).toBeLessThan(0)
    expect(compareDate(null, null)).toBe(0)
  })
})

describe('sortRows', () => {
  const rows = [
    { title: 'Marakka', plays: 40 },
    { title: 'annamalaiyar', plays: 120 },
    { title: 'Vaazhvinil', plays: 5 },
  ]

  it('sorts text ascending, case-insensitively', () => {
    expect(sortRows(rows, 'title', 'asc', getValue, 'text').map((r) => r.title)).toEqual([
      'annamalaiyar',
      'Marakka',
      'Vaazhvinil',
    ])
  })

  it('sorts text descending', () => {
    expect(sortRows(rows, 'title', 'desc', getValue, 'text').map((r) => r.title)).toEqual([
      'Vaazhvinil',
      'Marakka',
      'annamalaiyar',
    ])
  })

  it('sorts numbers ascending and descending', () => {
    expect(sortRows(rows, 'plays', 'asc', getValue, 'number').map((r) => r.plays)).toEqual([5, 40, 120])
    expect(sortRows(rows, 'plays', 'desc', getValue, 'number').map((r) => r.plays)).toEqual([120, 40, 5])
  })

  it('sorts dates with missing values last in both directions', () => {
    const dated = [
      { title: 'b', date: '2026-03-01' },
      { title: 'a', date: null },
      { title: 'c', date: '2026-01-01' },
    ]
    expect(sortRows(dated, 'date', 'asc', getValue, 'date').map((r) => r.title)).toEqual(['c', 'b', 'a'])
    expect(sortRows(dated, 'date', 'desc', getValue, 'date').map((r) => r.title)).toEqual(['b', 'c', 'a'])
  })

  it('is stable for equal keys and returns a copy without a key', () => {
    const tied = [
      { title: 'x', plays: 10 },
      { title: 'y', plays: 10 },
    ]
    expect(sortRows(tied, 'plays', 'asc', getValue, 'number').map((r) => r.title)).toEqual(['x', 'y'])
    const copy = sortRows(rows, null, 'asc', getValue)
    expect(copy).toEqual(rows)
    expect(copy).not.toBe(rows)
  })

  it('supports a custom getValue (e.g. derived track count)', () => {
    const lists = [
      { name: 'Big', trackIds: [1, 2, 3] },
      { name: 'Small', trackIds: [1] },
    ]
    const byCount = (row, key) => (key === 'count' ? row.trackIds.length : row[key])
    expect(sortRows(lists, 'count', 'desc', byCount, 'number').map((r) => r.name)).toEqual(['Big', 'Small'])
  })
})

describe('pagination helpers', () => {
  it('pageCountFor rounds up and never goes below 1', () => {
    expect(pageCountFor(0, 25)).toBe(1)
    expect(pageCountFor(25, 25)).toBe(1)
    expect(pageCountFor(26, 25)).toBe(2)
    expect(pageCountFor(100, 50)).toBe(2)
  })

  it('clampPage keeps the page inside range', () => {
    expect(clampPage(0, 60, 25)).toBe(1)
    expect(clampPage(9, 60, 25)).toBe(3)
    expect(clampPage(2, 60, 25)).toBe(2)
  })

  it('paginateRows slices the right window and clamps an out-of-range page', () => {
    const rows = Array.from({ length: 60 }, (_, i) => i + 1)
    expect(paginateRows(rows, 1, 25)).toEqual(rows.slice(0, 25))
    expect(paginateRows(rows, 3, 25)).toEqual(rows.slice(50, 60))
    expect(paginateRows(rows, 99, 25)).toEqual(rows.slice(50, 60))
  })

  it('page sizes are 25 / 50 / 100', () => {
    expect(LIST_PAGE_SIZES).toEqual([25, 50, 100])
  })
})
