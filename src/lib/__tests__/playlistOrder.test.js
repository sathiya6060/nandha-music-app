import { describe, expect, it } from 'vitest'
import { moveItemInList } from '../playlistOrder.js'

describe('moveItemInList (PT-009 drag-reorder)', () => {
  it('moves an item down', () => {
    expect(moveItemInList(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up', () => {
    expect(moveItemInList(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('does not mutate the input list', () => {
    const list = ['a', 'b', 'c']
    const next = moveItemInList(list, 0, 2)
    expect(list).toEqual(['a', 'b', 'c'])
    expect(next).not.toBe(list)
  })

  it('no-op move returns the same reference', () => {
    const list = ['a', 'b']
    expect(moveItemInList(list, 1, 1)).toBe(list)
  })

  it('out-of-range indices return the list unchanged', () => {
    const list = ['a', 'b', 'c']
    expect(moveItemInList(list, -1, 1)).toBe(list)
    expect(moveItemInList(list, 0, 3)).toBe(list)
    expect(moveItemInList(list, 5, 0)).toBe(list)
    expect(moveItemInList(list, null, 1)).toBe(list)
    expect(moveItemInList(list, 0, null)).toBe(list)
  })

  it('non-array input is returned as-is', () => {
    expect(moveItemInList(null, 0, 1)).toBeNull()
    expect(moveItemInList(undefined, 0, 1)).toBeUndefined()
  })
})
