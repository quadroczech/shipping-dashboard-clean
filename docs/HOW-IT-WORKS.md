# Jak Shipping Dashboard funguje

Technický popis pro vývojáře a pokročilé uživatele: datový model, výpočet marže, pravidla pro
příplatky, aktivaci dopravců, synchronizaci zásilek a konvence v kódu.

## 1. Datový model

Základní jednotkou je **trasa** = kombinace *země × dopravce* (`country_carriers`). Ke každé trase
patří ceny, příplatky, faktury a smlouva.

| Tabulka | Obsah |
|---|---|
| `countries` | Země, měna, sazba DPH |
| `carriers` | Dopravci (kód, název, barva, odkaz na stránku s palivovým příplatkem) |
| `country_carriers` | Trasa země × dopravce; `is_active`, `contract_start`, `contract_end` |
| `carrier_base_prices` | Ceny dopravce: váhové pásmo, typ doručení, název služby, `surcharges_included` |
| `customer_prices` | Ceny pro zákazníka: typ doručení, název služby, doprava zdarma od |
| `return_prices` | Ceny za vrácení zásilky |
| `carrier_surcharges` | **Palivový a mýtný příplatek na úrovni dopravce** (platí pro všechny jeho trasy) |
| `surcharges` | Příplatky na úrovni trasy (dobírka, doručení na adresu, odlehlá oblast, …) a **přepisy** palivového/mýtného |
| `exchange_rates` | Denní kurzy ČNB → CZK |
| `invoices` | Faktury dopravců; odchylka od smluvní ceny je generovaný sloupec |
| `balikobot_stats` | Měsíční agregace zásilek: země × dopravce × měsíc × služba × typ doručení (název je historický, plní se z Lokia) |
| `lokia_document_detail_cache` | Cache detailů dokumentů z WMS (primární klíč = číslo dokumentu) |
| `lokia_service_map` | Mapování služeb WMS na našeho dopravce a typ doručení |
| `lokia_branch_map` | Mapování `BranchId` na skutečného dopravce (viz kap. 5) |
| `competitor_prices` | Ceny dopravy u konkurence (stránka Průzkum trhu) |

**Podporované země:** CZ, SK, HU, RO, DE, AT, BE, NL, PL, FR, CH, IT, DK, SE a „COM" (mezinárodní e-shop).
**Měny:** CZK, EUR, HUF, RON, PLN, CHF, GBP, DKK, SEK.

### Pravidla platnosti

- `valid_to = NULL` znamená „platí aktuálně". Při zadání nové sazby se předchozí uzavírá
  (`valid_to = nové valid_from − 1 den`).
- U `carrier_surcharges` smí být pro dvojici (dopravce, typ) v jednom dni aktivní **jen jeden
  záznam**. Kdyby se překrývaly, marže by se zkreslila dvojím započtením – proto
  `getCarrierSurcharges()` drží pro každou dvojici jen nejnovější záznam a migrace `013`
  případné překryvy zpětně uzavírá.
- `carrier_base_prices.surcharges_included = true` znamená, že cena dopravce už příplatky
  obsahuje – **žádné příplatky se k ní nepřičítají** (ani v maržích, ani v simulátoru).

## 2. Výpočet marže

Implementace: `getProfitabilityMatrix(weightKg = 2)` v `src/lib/data.ts`. Ceník, Přehled,
Analýzy i Kalkulačka počítají při **2 kg**, aby čísla na všech stránkách seděla.

```
cena_zákazníka_bez_DPH = cena_zákazníka / (1 + sazba_DPH_země)
příplatky              = součet příplatků (viz níže)      → 0, pokud surcharges_included
náklad_dopravce        = cena_dopravce + příplatky
marže                  = cena_zákazníka_bez_DPH − náklad_dopravce
marže_%                = marže / cena_zákazníka_bez_DPH × 100
```

Jeden řádek matice vzniká pro každou **cenu zákazníka** (typ doručení × služba). K ní se hledá
cena dopravce v tomto pořadí:

1. přesná shoda (typ doručení, název služby),
2. stejný typ doručení, společná služba (`service_name = NULL`),
3. plně společný záznam (typ doručení i služba `NULL`),
4. jako poslední možnost první dostupný záznam trasy.

Trasy bez ceny dopravce nebo bez ceny zákazníka se do matice nezahrnují.

### Příplatky

| Typ | Kde je uložený | Výpočet |
|---|---|---|
| Palivový, mýtné | `carrier_surcharges` (na dopravce) | procentní: `cena_dopravce × hodnota/100`; pevná/na kg: hodnota v CZK přepočtená do měny země (× kg, je-li „na kg") |
| Přepis palivového/mýtného na trase | `surcharges` (stejný `type`) | hodnota `> 0` nahradí sazbu dopravce, hodnota `0` příplatek na této trase vypne |
| Ostatní (dobírka, adresa, …) | `surcharges` | procentní z ceny dopravce, nebo pevná částka (případně × kg) v měně příplatku |

### Měny

Všechny částky se převádějí přes kurz do CZK (`toCZK()` v `src/lib/constants.ts`) a zpět do
měny země. Kurzy přicházejí z ČNB; pokud v databázi chybí, použijí se výchozí hodnoty z
`DEFAULT_EXCHANGE_RATES`.

## 3. Aktivace a deaktivace dopravy

Doprava (trasa) se v **Ceníku** dá jedním klikem vypnout (ikona Power u řádku). Slouží pro
situace, kdy službu dočasně nebo trvale nepoužíváte, ale nechcete přijít o historii.

| Oblast | Chování deaktivované trasy |
|---|---|
| Ceník | Zůstává vidět, červeně, se štítkem „Neaktivní"; jde ji vyfiltrovat (filtr *Stav*) |
| Ceny a příplatky | Zůstávají uložené (historie se nemaže) |
| Marže – Přehled, Analýzy, Kalkulačka | Nezapočítává se (`getCountryCarriers()` vrací jen `is_active = true`) |
| Statistiky zásilek v Analýzách | Vyřazují se přes `getActiveRouteKeys()` (párování na `country_id` + `carrier_id`) |
| Stránka Zásilky | **Beze změny** – jsou to zásilky, které opravdu odešly |

> Kalkulačka počítá marže jen z aktivních tras, ale objemy zásilek (z posledních 12 měsíců)
> zatím nefiltruje.

## 4. Simulátor vlivu příplatků (Analýzy → „Vliv příplatků")

`src/components/analytics/fuel-surcharge-simulator.tsx`

- Zadáte nové sazby palivového příplatku po dopravcích (předvyplněné aktuálními hodnotami).
- Simuluje **jen trasy, které mají palivový příplatek** v rozpisu. Trasy s fixní cenou
  (`surcharges_included`) se zobrazí jako „v ceně" a marže se nemění.
- Ukazuje starý a nový příplatek, změnu marže v procentních bodech a doporučené zdražení pro
  zákazníka. Sloupec „využití dopravce" vychází z posledních 3 měsíců zásilek.
- Hodnoty předvyplněné v simulátoru jsou konstanta v kódu – při změně sazeb ji aktualizujte.

### Hromadná aktualizace paliva (Příplatky)

Tlačítko „Hromadná aktualizace paliva" – vyberete dopravce, procento a datum platnosti;
aplikace volitelně uzavře staré záznamy a založí nové pro všechny trasy dopravce.

## 5. Zásilky a synchronizace z WMS (Lokia)

### Tok dat

```
GitHub Action / Vercel cron
  1. přihlášení do WMS (OAuth2, token ~2 h)
  2. seznam dokončených výdejních dokumentů za měsíc
  3. dokumenty už v cache se přeskočí
  4. detaily nových dokumentů se stahují postupně (s pauzami kvůli rate limitu)
  5. uložení do lokia_document_detail_cache po dávkách
  6. AŽ NA KONCI agregace do balikobot_stats (smaže a znovu vloží daný měsíc)
```

- Synchronizace je **inkrementální** – při přerušení (timeout) stačí spustit znovu, hotové
  dokumenty se z cache přeskočí.
- Agregace do `balikobot_stats` proběhne až po zpracování všech dokumentů. Pokud běh vyprší
  dřív, jsou data v cache, ale statistiky se neaktualizují → spusťte synchronizaci znovu.
- Při odpovědi `429` klient čeká a zkouší stejný dokument znovu.

### Určení dopravce

Dopravce zásilky se určuje v tomto pořadí: **`lokia_branch_map` → `lokia_service_map` → základní
mapování kódu dopravce** (sdílený kód ve `scripts/lib/aggregate.mjs` a `src/lib/lokia-aggregate.ts`).

**Sub-dopravci Zásilkovny:** WMS u Zásilkovny vrací jen číselné `BranchId`, ne skutečného
dopravce poslední míle (např. v Rumunsku FAN Courier nebo Sameday). Mapování `BranchId → dopravce`
(včetně prefixů) spravujete na stránce *Zásilky* v panelu „Mapování sub-dopravců". Po přidání
mapování se automaticky přepočítají dotčené měsíce. Pro zpětné doplnění `BranchId` ze starších
dokumentů slouží `scripts/lokia-backfill-branch.mjs` (a režim `backfill` v GitHub Action).

## 6. Další funkce

- **Import ceníku z PDF** (Dopravci): PDF se odešle na `POST /api/parse-pricelist`, model
  Claude vrátí strukturované řádky (země, typ doručení, váhové pásmo, cena). Řádky se **jen
  zobrazí ke kontrole** – do databáze se nic nezapisuje, dokud je nepotvrdíte.
- **Faktury**: evidence faktur dopravců, porovnání s očekávaným (smluvním) součtem, odchylka
  v Kč a %, stavy zpracování.
- **Export**: marže do CSV (Kalkulačka), počty zásilek dle váhových pásem do Excelu (Zásilky).
- **Průzkum trhu**: ruční evidence cen konkurence a porovnání s našimi cenami.

## 7. Konvence v kódu

- Načítání dat je centralizované v `src/lib/data.ts` (server-side, Supabase). Funkce při chybě
  vracejí prázdné pole/`null` a chybu zalogují.
- Po každé zápisové operaci z klienta se volá `router.refresh()`, aby se překreslily server
  komponenty.
- Vlajky zemí: komponenta `<FlagImage code="CZ" />` (ne emoji z databáze).
- Dopravci: `<CarrierBadge carrier={carrier} />`.
- Notifikace: `toast.success()` / `toast.error()` ze `sonner`.
- Stránky s daty mají `revalidate` (Přehled a Analýzy 300 s, Ceník bez cache).

## 8. Jak přidat…

- **Novou zemi / měnu:** upravte typ `Currency`, `COUNTRIES_SEED`, `CURRENCY_SYMBOLS`,
  `DEFAULT_EXCHANGE_RATES` a seznam sledovaných měn v cronu kurzů, a přidejte migraci
  (`countries` + `exchange_rates`). Příklad: `012_add_denmark_sweden.sql`.
- **Nového dopravce:** v Ceníku → „Přidat dopravu" → „Nový dopravce", nebo migrací do `carriers`;
  pro zásilky přidejte mapování kódu z WMS.
- **Novou migraci:** soubor v `supabase/migrations/` s dalším číslem, spustit v Supabase SQL Editoru.
