// resolvePlayTarget contract (28 Nov 2026).
//
// Pressing Play on a track that is NOT in the given queue used to
// play queue[0] instead: play() did `findIndex` (-1) and then
// `target = idx >= 0 ? idx : 0`, so Malaiyoram played Vaazhvinil
// and a draft's Play played Vaazhvinil too. The fix appends the
// requested track and plays the appended index — the same rule the
// no-queueList branch already used. These tests fail on the old
// `idx : 0` default and pass on the append.
import { describe, it, expect } from 'vitest'
import { resolvePlayTarget } from '../../player/PlayerContext.jsx'
import { mockVaazhvinil, mockMalaiyoram, mockMarakka } from './testHelpers.js'

const vaazhvinil = mockVaazhvinil()
const malaiyoram = mockMalaiyoram()
const marakka = mockMarakka()

describe('resolvePlayTarget', () => {
  it('plays the track at its own index when it is in the queue', () => {
    const queue = [vaazhvinil, malaiyoram, marakka]
    const { queue: out, target } = resolvePlayTarget(queue, malaiyoram)
    expect(target).toBe(1)
    expect(out).toBe(queue)
    expect(out[target]).toBe(malaiyoram)
  })

  it('appends a track that is NOT in the queue and plays the appended index — never queue[0]', () => {
    const queue = [vaazhvinil, marakka]
    const { queue: out, target } = resolvePlayTarget(queue, malaiyoram)
    expect(target).toBe(2)
    expect(out[target]).toBe(malaiyoram)
    expect(out[0]).toBe(vaazhvinil)
    expect(out).toHaveLength(3)
  })

  it('does not mutate the given queue', () => {
    const queue = [vaazhvinil]
    const { queue: out } = resolvePlayTarget(queue, malaiyoram)
    expect(queue).toHaveLength(1)
    expect(out).not.toBe(queue)
    expect(out).toEqual([vaazhvinil, malaiyoram])
  })

  it('handles an empty queue by starting a queue with the track', () => {
    const { queue, target } = resolvePlayTarget([], malaiyoram)
    expect(queue).toEqual([malaiyoram])
    expect(target).toBe(0)
  })

  it('handles a missing queue the same way', () => {
    const { queue, target } = resolvePlayTarget(null, malaiyoram)
    expect(queue).toEqual([malaiyoram])
    expect(target).toBe(0)
  })
})
