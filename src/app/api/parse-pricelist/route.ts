/**
 * Parse a carrier price-list PDF into structured base-price rows using Claude.
 *
 * POST /api/parse-pricelist
 *   body: { pdfBase64: string, carrierCode: string, carrierName?: string }
 *   ->   { ok: true, rows: ExtractedRow[] }  |  { error: string }
 *
 * The rows are returned for review in the UI; nothing is written to the DB here.
 * Requires ANTHROPIC_API_KEY in the server environment.
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 120

export interface ExtractedRow {
  country_code: string
  delivery_type: 'home' | 'pickup' | 'unknown'
  service_name: string
  weight_from: number
  weight_to: number
  base_price: number
  currency: string
}

// JSON schema for structured output (no min/max constraints — unsupported).
const PRICELIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          country_code: { type: 'string', description: 'ISO 3166-1 alpha-2 country code, uppercase (CZ, SK, DE, ...).' },
          delivery_type: { type: 'string', enum: ['home', 'pickup', 'unknown'], description: 'home = courier to address, pickup = parcel shop/box, unknown if not stated.' },
          service_name: { type: 'string', description: 'Service/product name as printed, or empty string.' },
          weight_from: { type: 'number', description: 'Lower bound of the weight band in kg (0 if a single "up to X" band).' },
          weight_to: { type: 'number', description: 'Upper bound of the weight band in kg.' },
          base_price: { type: 'number', description: 'Base transport price as a number, without currency symbol.' },
          currency: { type: 'string', description: 'ISO currency code, uppercase (usually CZK).' },
        },
        required: ['country_code', 'delivery_type', 'service_name', 'weight_from', 'weight_to', 'base_price', 'currency'],
      },
    },
  },
  required: ['rows'],
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY není nastaven na serveru. Doplňte ho do prostředí (Vercel → Environment Variables).' },
      { status: 503 },
    )
  }

  let body: { pdfBase64?: string; carrierCode?: string; carrierName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Neplatné tělo požadavku.' }, { status: 400 })
  }

  const { pdfBase64, carrierCode, carrierName } = body
  if (!pdfBase64 || !carrierCode) {
    return NextResponse.json({ error: 'Chybí pdfBase64 nebo carrierCode.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      output_config: { format: { type: 'json_schema', schema: PRICELIST_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text:
                `Toto je ceník dopravce ${carrierName ?? carrierCode} (kód ${carrierCode}) za přepravu zásilek. ` +
                `Vyčti VŠECHNY řádky cen za základní přepravu (NE příplatky jako palivo, mýto nebo dobírka) a vrať je strukturovaně.\n` +
                `Pravidla:\n` +
                `- country_code: ISO kód cílové země velkými písmeny (CZ, SK, HU, RO, DE, AT, BE, NL, PL, FR, CH, IT, DK, SE). Pokud ceník platí pro jednu zemi a neuvádí ji u každého řádku, použij tu zemi.\n` +
                `- delivery_type: "home" pro doručení na adresu/kurýrem, "pickup" pro výdejní místo/box/depo, "unknown" pokud není uvedeno.\n` +
                `- service_name: název služby/produktu jak je v ceníku, jinak prázdný řetězec.\n` +
                `- weight_from / weight_to: hmotnostní pásmo v kg. Pro jediné pásmo "do X kg" použij weight_from=0, weight_to=X.\n` +
                `- base_price: jen číslo, bez měny.\n` +
                `- currency: ISO kód měny (většinou CZK).\n` +
                `Nevymýšlej řádky, které v ceníku nejsou.`,
            },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'Model odmítl zpracovat tento dokument.' }, { status: 502 })
    }

    // With output_config.format the JSON is returned as the text block.
    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    let parsed: { rows?: ExtractedRow[] }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Model nevrátil platná data.' }, { status: 502 })
    }

    const rows = Array.isArray(parsed.rows) ? parsed.rows : []
    return NextResponse.json({ ok: true, rows })
  } catch (err) {
    console.error('parse-pricelist error:', err)
    const message = err instanceof Error ? err.message : 'Neznámá chyba'
    return NextResponse.json({ error: `Chyba při čtení PDF: ${message}` }, { status: 502 })
  }
}
