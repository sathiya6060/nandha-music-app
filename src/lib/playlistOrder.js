/**
 * Pure list-reorder helper (Spotify batch, 27 Nov 2026 — PT-009).
 * moveItemInList(list, from, to) returns a NEW list with the item at
 * `from` moved to `to`. Out-of-range indices, nulls and no-op moves
 * return the input list unchanged (same reference). The drag wiring in
 * PlaylistDetail.jsx calls this; the ordering itself is unit-tested
 * here because the live catalog (1 track) cannot show a visible order
 * change until a second song exists.
 */
export function moveItemInList(list, from, to) {
  if (!Array.isArray(list)) return list
  // Strict equality: from/to are array indices, never null/undefined here.
  if (from === null || from === undefined || to === null || to === undefined || from === to) return list
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
