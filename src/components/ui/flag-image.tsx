'use client'

interface FlagImageProps {
  code: string
  className?: string
}

/**
 * Renders a country flag image via flagcdn.com.
 * Unlike emoji flags, these render correctly on Windows/Chrome.
 */
export function FlagImage({ code, className = '' }: FlagImageProps) {
  if (!code) return null

  // Globe emoji works fine on all platforms (not a regional indicator)
  if (code === 'COM') {
    return <span className={`align-middle text-sm leading-none ${className}`}>🌍</span>
  }

  const lower = code.toLowerCase()
  return (
    <img
      src={`https://flagcdn.com/w20/${lower}.png`}
      srcSet={`https://flagcdn.com/w40/${lower}.png 2x`}
      alt={`${code} flag`}
      width={20}
      height={15}
      className={`inline-block align-middle rounded-sm ${className}`}
    />
  )
}
