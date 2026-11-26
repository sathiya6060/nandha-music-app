import { useState } from 'react'

/**
 * Nandha Music logo.
 * Uses /assets/nandha-logo.png with a styled gold "N" lettermark fallback
 * if the image is missing or fails to load.
 * Props: { size } — pixel size of the square mark (default 40).
 */
export default function Logo({ size = 40 }) {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) {
    return (
      <span
        aria-label="Nandha Music"
        role="img"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: 10,
          background: 'var(--gold)',
          color: 'var(--white)',
          fontWeight: 800,
          fontSize: Math.round(size * 0.55),
          lineHeight: 1,
          fontFamily: 'var(--font)',
        }}
      >
        N
      </span>
    )
  }

  return (
    <img
      src="/assets/nandha-logo.png"
      alt="Nandha Music"
      width={size}
      height={size}
      onError={() => setImgFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, borderRadius: 10 }}
    />
  )
}
