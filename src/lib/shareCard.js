/**
 * Share-as-Status lyric card — 1080x1920 story card drawn on <canvas>.
 * Cover image + Tamil lyric line (Noto Sans Tamil Bold) + N logo +
 * brand colours + 'NANDHA MUSIC' + tagline. Returns a JPG blob; the
 * caller offers navigator.share with the file when supported, else a
 * plain download.
 */

const W = 1080
const H = 1920

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image: ${src}`))
    img.src = src
  })
}

function drawCoverFit(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function wrapText(ctx, text, maxWidth, maxLines = 4) {
  const words = String(text || '').split(/\s+/)
  const lines = []
  let line = ''
  for (let word of words) {
    // A single unbreakable word wider than the box (e.g. a long Tamil
    // compound) would otherwise overflow the canvas — truncate it.
    if (ctx.measureText(word).width > maxWidth) {
      word = truncateText(ctx, word, maxWidth)
    }
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, maxLines)
}

/** Single-line truncate with an ellipsis so text never runs off the canvas. */
function truncateText(ctx, text, maxWidth) {
  const str = String(text || '')
  if (ctx.measureText(str).width <= maxWidth) return str
  const ellipsis = '…'
  let low = 0
  let high = str.length
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (ctx.measureText(str.slice(0, mid) + ellipsis).width <= maxWidth) low = mid
    else high = mid - 1
  }
  return str.slice(0, low) + ellipsis
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Generate the 1080x1920 story card for a track.
 * Returns { blob, url, filename }. Caller must revoke `url` when done.
 */
async function generateStoryCard(track, { lyric } = {}) {
  // Make sure the Tamil bold face is available before measuring text.
  try {
    await document.fonts.load('700 64px "Noto Sans Tamil"')
    await document.fonts.load('800 48px "Inter"')
  } catch {
    // fonts may already be loaded or unavailable — draw with fallbacks
  }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background: Charcoal Slate with a warm gold glow at the top.
  ctx.fillStyle = '#1E293B'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 260, 40, W / 2, 260, 720)
  glow.addColorStop(0, 'rgba(245, 158, 11, 0.55)')
  glow.addColorStop(1, 'rgba(245, 158, 11, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Cover art, centred, with a gold ring.
  const coverSize = 880
  const coverX = (W - coverSize) / 2
  const coverY = 210
  ctx.save()
  roundedRect(ctx, coverX, coverY, coverSize, coverSize, 36)
  ctx.clip()
  if (track.cover) {
    try {
      const coverImg = await loadImage(track.cover)
      drawCoverFit(ctx, coverImg, coverX, coverY, coverSize, coverSize)
    } catch {
      ctx.fillStyle = '#F59E0B'
      ctx.fillRect(coverX, coverY, coverSize, coverSize)
    }
  } else {
    const grad = ctx.createLinearGradient(coverX, coverY, coverX + coverSize, coverY + coverSize)
    grad.addColorStop(0, '#F59E0B')
    grad.addColorStop(1, '#1E293B')
    ctx.fillStyle = grad
    ctx.fillRect(coverX, coverY, coverSize, coverSize)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 420px "Noto Sans Tamil", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('N', W / 2, coverY + coverSize / 2 + 20)
  }
  ctx.restore()
  ctx.strokeStyle = '#F59E0B'
  ctx.lineWidth = 6
  roundedRect(ctx, coverX, coverY, coverSize, coverSize, 36)
  ctx.stroke()

  // Tamil lyric line (centre safe area — inside 75% width).
  // M36: the old layout drew up to 4 lyric lines from y=1180, then
  // the title + artist with bare fillText — a long title ran off the
  // 1080px canvas and the 4th lyric line collided with the logo at
  // y=1640. Lyrics now cap at 3 lines, the title wraps to 2 lines,
  // the artist truncates to one line, and every y is computed from
  // what was actually drawn, with the logo zone kept clear.
  const lyricText = lyric || (track.lyricsTa && track.lyricsTa[0]) || track.titleTa || track.titleEn || ''
  ctx.fillStyle = '#FEF3C7'
  ctx.font = '700 62px "Noto Sans Tamil", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const lines = wrapText(ctx, lyricText, W * 0.76, 3)
  let ly = 1170
  for (const line of lines) {
    ctx.fillText(line, W / 2, ly)
    ly += 80
  }

  // Title (English, smaller) — wrapped to 2 lines inside the safe area.
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '700 44px "Inter", sans-serif'
  const titleLines = wrapText(ctx, track.titleEn || track.titleTa || '', W * 0.8, 2)
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, ly + 28)
    ly += 56
  }
  // Artist — one truncated line, never wider than the safe area.
  ctx.fillStyle = 'rgba(254, 243, 199, 0.75)'
  ctx.font = '400 36px "Inter", sans-serif'
  ctx.fillText(truncateText(ctx, track.artist || 'Nandha Music', W * 0.8), W / 2, ly + 28)

  // Brand lockup at the bottom: N logo + NANDHA MUSIC + tagline.
  try {
    const logo = await loadImage('/assets/nandha-logo.png')
    const logoSize = 120
    ctx.drawImage(logo, W / 2 - logoSize / 2, 1640, logoSize, logoSize)
  } catch {
    // logo missing — text lockup still renders below
  }
  ctx.fillStyle = '#F59E0B'
  ctx.font = '800 46px "Inter", sans-serif'
  ctx.fillText('NANDHA MUSIC', W / 2, 1780)
  ctx.fillStyle = 'rgba(254, 243, 199, 0.8)'
  ctx.font = '600 28px "Inter", sans-serif'
  ctx.fillText('YOUR BEAT. YOUR ECHO.', W / 2, 1840)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  const url = URL.createObjectURL(blob)
  const safe = String(track.titleEn || track.id || 'nandha-music').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return { blob, url, filename: `nandha-music-${safe}-status.jpg` }
}

/**
 * Share the card with navigator.share when file sharing is supported,
 * otherwise download it. Returns 'shared' | 'downloaded'.
 */
export async function shareOrDownloadStoryCard(track, options) {
  const { blob, url, filename } = await generateStoryCard(track, options)
  const file = new File([blob], filename, { type: 'image/jpeg' })
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: track.titleTa || track.titleEn || 'Nandha Music' })
      URL.revokeObjectURL(url)
      return 'shared'
    }
  } catch {
    // User cancelled the share sheet, or share failed — fall to download.
  }
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
