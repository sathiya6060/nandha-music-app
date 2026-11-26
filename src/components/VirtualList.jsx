import { useCallback, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.js'

const OVERSCAN = 5

/**
 * Lightweight virtual scrolling (no react-window).
 * Props: { items, rowHeight, renderRow, height }
 * Renders only the visible rows (+ overscan 5) inside a scrollable div.
 * `renderRow(item, index)` must return a row element. Each row is
 * absolutely positioned at top = index * rowHeight.
 */
export default function VirtualList({ items, rowHeight, renderRow, height = 480 }) {
  const { t } = useI18n()
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)

  const onScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const list = items || []
  const totalHeight = list.length * rowHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const visibleCount = Math.ceil(height / rowHeight) + OVERSCAN * 2
  const endIndex = Math.min(list.length, startIndex + visibleCount)
  const visible = list.slice(startIndex, endIndex)

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{ height, overflowY: 'auto', position: 'relative', overscrollBehavior: 'contain' }}
      role="list"
      aria-label={t('search.results', { n: list.length })}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((item, i) => {
          const index = startIndex + i
          return (
            <div
              key={item?.id ?? index}
              role="listitem"
              style={{ position: 'absolute', top: index * rowHeight, left: 0, right: 0, height: rowHeight }}
            >
              {renderRow(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
