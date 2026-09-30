'use client'

// Maps carrier code → favicon URL
const CARRIER_FAVICON: Record<string, string> = {
  PPL:                  'https://www.google.com/s2/favicons?domain=ppl.cz&sz=64',
  GLS:                  'https://gls-group.com/favicon.ico',
  PACKETA:              'https://www.google.com/s2/favicons?domain=packeta.com&sz=64',
  SLOVENSKA_POSTA:      'https://www.google.com/s2/favicons?domain=posta.sk&sz=64',
  CESKA_POSTA:          'https://www.balikovna.cz/favicon.ico',
  DHL:                  'https://www.google.com/s2/favicons?domain=dhl.com&sz=64',
  SPS:                  'https://www.google.com/s2/favicons?domain=sps.sk&sz=64',
  BALIKOVO:             'https://www.google.com/s2/favicons?domain=balikovo.sk&sz=64',
  MAGYAR_POSTA:         'https://www.google.com/s2/favicons?domain=posta.hu&sz=64',
  FOXPOST:              'https://www.google.com/s2/favicons?domain=foxpost.hu&sz=64',
  CARGUS:               'https://www.google.com/s2/favicons?domain=cargus.ro&sz=64',
  FAN_COURIER:          'https://www.google.com/s2/favicons?domain=fancourier.ro&sz=64',
  MONDIAL_RELAY:        'https://www.google.com/s2/favicons?domain=mondialrelay.fr&sz=64',
  COLIS_PRIVE:          'https://www.google.com/s2/favicons?domain=colisprive.fr&sz=64',
  BRT:                  'https://www.google.com/s2/favicons?domain=brt.it&sz=64',
  SWISS_POST:           'https://www.google.com/s2/favicons?domain=post.ch&sz=64',
  BPOST:                'https://www.google.com/s2/favicons?domain=bpost.be&sz=64',
  OSTERREICHISCHE_POST: 'https://www.google.com/s2/favicons?domain=post.at&sz=64',
  DPD:                  'https://www.google.com/s2/favicons?domain=dpd.com&sz=64',
  FEDEX:                'https://www.google.com/s2/favicons?domain=fedex.com&sz=64',
}

interface CarrierBadgeProps {
  carrier: {
    code: string
    name: string
    logo_color: string
  }
  showName?: boolean
  size?: 'sm' | 'md' | 'lg'
}

// Short display names for the colored badge
const CARRIER_SHORT_NAME: Record<string, string> = {
  CESKA_POSTA:     'Balíkovna',
  SLOVENSKA_POSTA: 'SKpošta',
  PACKETA:         'Zásilkovna',
}

const SIZES = {
  sm: { icon: 14, badge: 'text-[10px] px-1.5 py-0.5', gap: 'gap-1.5' },
  md: { icon: 20, badge: 'text-xs px-2 py-0.5', gap: 'gap-2' },
  lg: { icon: 28, badge: 'text-sm px-2.5 py-1', gap: 'gap-2.5' },
}

// Returns true if a hex color is light enough to need dark text
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Perceived luminance
  return (r * 299 + g * 587 + b * 114) / 1000 > 160
}

export function CarrierBadge({ carrier, showName = false, size = 'sm' }: CarrierBadgeProps) {
  const faviconUrl = CARRIER_FAVICON[carrier.code]
  const badgeLabel = CARRIER_SHORT_NAME[carrier.code]
    ?? (carrier.code.length > 10 ? carrier.code.split('_')[0] : carrier.code)
  const s = SIZES[size]
  const textColor = isLightColor(carrier.logo_color) ? '#1a1a1a' : '#ffffff'

  return (
    <div className={`inline-flex items-center ${s.gap}`}>
      {faviconUrl && (
        <img
          src={faviconUrl}
          alt={carrier.name}
          width={s.icon}
          height={s.icon}
          className="rounded-sm flex-shrink-0"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <span
        className={`rounded font-semibold whitespace-nowrap ${s.badge}`}
        style={{ backgroundColor: carrier.logo_color, color: textColor }}
        title={carrier.name}
      >
        {badgeLabel}
      </span>
      {showName && (
        <span className="text-xs text-gray-600 truncate max-w-[120px]">{carrier.name}</span>
      )}
    </div>
  )
}
