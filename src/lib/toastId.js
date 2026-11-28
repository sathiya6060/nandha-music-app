// Toast id generator (L12) — kept in its own module so toast.jsx
// (a component file) does not export a non-component helper.
// Date.now() alone can collide within the same millisecond (two
// toasts fired in one tick share an id — and the id is the React
// key), so the id pairs wall-clock ms with a monotonic counter.
let toastIdCounter = 0

/** Collision-proof toast id: wall-clock ms + a per-process counter. */
export function nextToastId() {
  toastIdCounter += 1
  return `toast-${Date.now()}-${toastIdCounter}`
}
