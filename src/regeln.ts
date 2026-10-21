// Partner-Protokoll (PROTOKOLL.md): reine Logik ohne Ein-/Ausgabe – belegte Zeiten aus eigenen Regeln
// (normal und Ausnahme), gemeinsame freie Zeiten finden und bewerten (gestuft beim Ausweichen), Regelprüfung beim Reservieren.
import { tagPlus, tagVon, tageZwischen, wochentag, zeitpunkt } from './zeit.ts'

/** Was das Protokoll von einem eigenen Termin braucht (jedes System bildet seine Termine darauf ab) */
export interface ProtokollTermin {
  /** ISO (UTC) bzw. bei ganztägig JJJJ-MM-TT */
  beginn: string
  /** exklusiv: ISO (UTC) bzw. bei ganztägig der Tag nach dem letzten Tag */
  ende: string
  ganztag: boolean
  /** nur Beginn bekannt: zählt als 60 min */
  ohneEnde?: boolean
  /** Prüfungsart (z. B. Klausur) – ganztägig gesetzt = Prüfungstag */
  art?: string
  /** gesetzt (z. B. true oder { stunden }) bei ganztägigem Arbeitstag: ganz belegt */
  arbeit?: unknown
  /** 'todo' = Aufgabe mit Uhrzeit, kein Termin – zählt nicht als belegt */
  quelle?: string
}

export const RASTER_MIN = 15
export const MAX_TAGE = 31
export const MIN_DAUER = 15
export const MAX_DAUER = 480

export interface Block {
  beginn: string
  ende: string
}

export type Stufe = 'normal' | 'ausnahme'

/** Ausnahme-Regeln: gelten nur, wenn nach den normalen Regeln nichts passt („Ausweichen“, Protokoll v1.1) */
export interface Ausnahme {
  erlaubt: boolean
  fenster: Record<string, string[]>
  pufferMin: number
  vorlaufStd: number
}

export interface Regeln {
  /** erlaubte Fenster je Wochentag 1 (Mo) … 7 (So), „HH:MM-HH:MM“ */
  fenster: Record<string, string[]>
  /** Wunschzeiten je Wochentag, gleiches Format (optional) */
  bevorzugt: Record<string, string[]>
  pufferMin: number
  maxProWoche: number
  maxDauerMin: number
  vorlaufStd: number
  pruefungstageFrei: boolean
  ausnahme: Ausnahme
  /** Ersatztermin direkt eintragen oder erst Vorschläge zeigen */
  ausweichen: 'automatisch' | 'fragen'
}

export const STANDARD_REGELN: Regeln = {
  fenster: { '1': ['14:00-21:00'], '2': ['14:00-21:00'], '3': ['14:00-21:00'], '4': ['14:00-21:00'], '5': ['14:00-21:00'], '6': ['10:00-20:00'], '7': ['10:00-20:00'] },
  bevorzugt: {},
  pufferMin: 30,
  maxProWoche: 3,
  maxDauerMin: 240,
  vorlaufStd: 12,
  pruefungstageFrei: true,
  ausnahme: {
    erlaubt: true,
    fenster: { '1': ['13:00-22:00'], '2': ['13:00-22:00'], '3': ['13:00-22:00'], '4': ['13:00-22:00'], '5': ['13:00-22:00'], '6': ['09:00-22:00'], '7': ['09:00-22:00'] },
    pufferMin: 15,
    vorlaufStd: 6,
  },
  ausweichen: 'automatisch',
}

/** Regeln mit den Ausnahme-Werten (Fenster, Puffer, Vorlauf); Wochengrenze, Höchstdauer und Prüfungstage bleiben */
export function ausnahmeRegeln(r: Regeln): Regeln {
  return { ...r, fenster: r.ausnahme.fenster, pufferMin: r.ausnahme.pufferMin, vorlaufStd: r.ausnahme.vorlaufStd }
}

const ms = (iso: string) => Date.parse(iso)
const iso = (t: number) => new Date(t).toISOString()

/** Überlappende/angrenzende Blöcke zusammenfassen, sortiert */
export function zusammenfassen(bloecke: Block[]): Block[] {
  const s = bloecke.filter((b) => ms(b.ende) > ms(b.beginn)).sort((a, b) => ms(a.beginn) - ms(b.beginn))
  const r: Block[] = []
  for (const b of s) {
    const letzter = r[r.length - 1]
    if (letzter && ms(b.beginn) <= ms(letzter.ende)) {
      if (ms(b.ende) > ms(letzter.ende)) letzter.ende = b.ende
    } else r.push({ ...b })
  }
  return r.map((b) => ({ beginn: iso(ms(b.beginn)), ende: iso(ms(b.ende)) }))
}

/** „HH:MM-HH:MM“ an einem Tag → UTC-Block (ungültige Angaben werden übersprungen) */
function fensterBlock(tag: string, f: string): Block | null {
  const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(f.trim())
  if (!m) return null
  const b = zeitpunkt(tag, m[1]!)
  const e = m[2] === '24:00' ? zeitpunkt(tagPlus(tag, 1), '00:00') : zeitpunkt(tag, m[2]!)
  return ms(e) > ms(b) ? { beginn: b, ende: e } : null
}

/** Fenster eines Wochentag-Plans im Zeitraum als Blöcke */
export function fensterBloecke(plan: Record<string, string[]>, von: string, bis: string): Block[] {
  return tageZwischen(von, bis).flatMap((tag) => (plan[String(wochentag(tag))] ?? []).map((f) => fensterBlock(tag, f)).filter((b): b is Block => !!b))
}

/** Komplement: alles im Zeitraum, was nicht in den Blöcken liegt */
export function ausserhalb(bloecke: Block[], von: string, bis: string): Block[] {
  const start = ms(zeitpunkt(von, '00:00'))
  const ende = ms(zeitpunkt(bis, '00:00'))
  const r: Block[] = []
  let t = start
  for (const b of zusammenfassen(bloecke)) {
    if (ms(b.beginn) > t) r.push({ beginn: iso(t), ende: iso(Math.min(ms(b.beginn), ende)) })
    t = Math.max(t, ms(b.ende))
  }
  if (t < ende) r.push({ beginn: iso(t), ende: iso(ende) })
  return r.filter((b) => ms(b.ende) > ms(b.beginn))
}

/**
 * Belegte Zeiten nach eigenen Regeln: Termine (mit Puffer), Zeiten außerhalb der Fenster, Prüfungstage.
 * Ganztägige Termine blockieren nicht (Geburtstage, Feiertage) – außer Prüfungen und Arbeit.
 * Termine ohne Ende zählen vorsichtshalber als 60 min belegt (keine Dauer erfunden, nur zur Sicherheit freigehalten).
 */
export function belegtNachRegeln(termine: ProtokollTermin[], r: Regeln, von: string, bis: string): Block[] {
  const puffer = r.pufferMin * 60_000
  const bloecke: Block[] = []
  for (const t of termine) {
    if (t.quelle === 'todo') continue
    const pruefung = !!t.art
    if (t.ganztag) {
      if ((pruefung && r.pruefungstageFrei) || t.arbeit) bloecke.push({ beginn: zeitpunkt(t.beginn, '00:00'), ende: zeitpunkt(t.ende, '00:00') })
      continue
    }
    if (pruefung && r.pruefungstageFrei) {
      const tag = tagVon(t.beginn)
      bloecke.push({ beginn: zeitpunkt(tag, '00:00'), ende: zeitpunkt(tagPlus(tag, 1), '00:00') })
    }
    const ende = t.ohneEnde ? ms(t.beginn) + 60 * 60_000 : ms(t.ende)
    bloecke.push({ beginn: iso(ms(t.beginn) - puffer), ende: iso(ende + puffer) })
  }
  bloecke.push(...ausserhalb(fensterBloecke(r.fenster, von, bis), von, bis))
  return zusammenfassen(bloecke)
}

/** Schnittmenge zweier Blocklisten */
export function schnitt(a: Block[], b: Block[]): Block[] {
  const x = zusammenfassen(a)
  const y = zusammenfassen(b)
  const r: Block[] = []
  for (const p of x) for (const q of y) {
    const beginn = Math.max(ms(p.beginn), ms(q.beginn))
    const ende = Math.min(ms(p.ende), ms(q.ende))
    if (ende > beginn) r.push({ beginn: iso(beginn), ende: iso(ende) })
  }
  return zusammenfassen(r)
}

/** Was selbst nach den Ausnahme-Regeln nicht geht – immer Teilmenge der normalen Belegung; Ausnahme aus → = belegt */
export function belegtAusnahmeNachRegeln(termine: ProtokollTermin[], r: Regeln, von: string, bis: string): Block[] {
  const normal = belegtNachRegeln(termine, r, von, bis)
  return r.ausnahme?.erlaubt ? schnitt(normal, belegtNachRegeln(termine, ausnahmeRegeln(r), von, bis)) : normal
}

const ueberlappt = (a: Block, b: Block) => ms(a.beginn) < ms(b.ende) && ms(b.beginn) < ms(a.ende)
const liegtIn = (a: Block, b: Block) => ms(a.beginn) >= ms(b.beginn) && ms(a.ende) <= ms(b.ende)

export interface Vorschlag extends Block {
  punkte: number
}

/** Gemeinsame freie Zeiten im 15-min-Raster finden und bewerten (beste zuerst) */
export function gemeinsameZeiten(o: {
  von: string
  bis: string
  dauerMin: number
  eigeneBelegt: Block[]
  partnerBelegt: Block[]
  eigeneBevorzugt: Block[]
  partnerBevorzugt: Block[]
  jetzt: Date
  vorlaufStd: number
  anzahl?: number
}): Vorschlag[] {
  const belegt = zusammenfassen([...o.eigeneBelegt, ...o.partnerBelegt])
  const fruehestens = o.jetzt.getTime() + o.vorlaufStd * 3_600_000
  const dauer = o.dauerMin * 60_000
  const r: Vorschlag[] = []
  const startTag = ms(zeitpunkt(o.von, '00:00'))
  for (const tag of tageZwischen(o.von, o.bis)) {
    const tagEnde = ms(zeitpunkt(tagPlus(tag, 1), '00:00'))
    for (let t = ms(zeitpunkt(tag, '00:00')); t + dauer <= tagEnde; t += RASTER_MIN * 60_000) {
      if (t < fruehestens) continue
      const s = { beginn: iso(t), ende: iso(t + dauer) }
      if (belegt.some((b) => ueberlappt(b, s))) continue
      const tageAbstand = Math.floor((t - startTag) / 86_400_000)
      const punkte = (o.eigeneBevorzugt.some((b) => liegtIn(s, b)) ? 2 : 0) + (o.partnerBevorzugt.some((b) => liegtIn(s, b)) ? 2 : 0) - 0.1 * tageAbstand
      r.push({ ...s, punkte: Math.round(punkte * 10) / 10 })
    }
  }
  return r.sort((a, b) => b.punkte - a.punkte || ms(a.beginn) - ms(b.beginn)).slice(0, o.anzahl ?? 5)
}

/** Eine Seite bei der Ausweich-Suche; Vorlauf des Partners ist unbekannt (0) – er lehnt dann selbst mit 409 ab */
export interface Seite {
  belegt: Block[]
  belegtAusnahme: Block[]
  bevorzugt: Block[]
  vorlaufStd: number
  vorlaufAusnahmeStd: number
}

export interface Kandidat extends Vorschlag {
  eigen: Stufe
  partner: Stufe
  /** Tage nach dem gewählten Zeitraum (Stufe 3) */
  tageDanach: number
}

/**
 * Gestufte Suche (Protokoll v1.1): 1 normal/normal im Zeitraum · 2 mit Ausnahme (−3 je Seite) · 3 bis zu 7 Tage später
 * (erst normal, dann Ausnahme; −0,5 je Tag danach). Ergebnis: die erste nicht leere Stufe, beste zuerst.
 */
export function ausweichSuche(o: { von: string; bis: string; bisMax: string; dauerMin: number; eigen: Seite; partner: Seite; jetzt: Date; anzahl?: number }): { stufe: 0 | 1 | 2 | 3; vorschlaege: Kandidat[] } {
  const dauer = o.dauerMin * 60_000
  const startTag = ms(zeitpunkt(o.von, '00:00'))
  const endeZeitraum = ms(zeitpunkt(o.bis, '00:00'))
  const seiten = [o.eigen, o.partner].map((s) => ({ ...s, belegt: zusammenfassen(s.belegt), belegtAusnahme: zusammenfassen(s.belegtAusnahme) }))
  const stufeVon = (s: (typeof seiten)[number], b: Block, t: number, mitAusnahme: boolean): Stufe | null => {
    if (t >= o.jetzt.getTime() + s.vorlaufStd * 3_600_000 && !s.belegt.some((x) => ueberlappt(x, b))) return 'normal'
    if (mitAusnahme && t >= o.jetzt.getTime() + s.vorlaufAusnahmeStd * 3_600_000 && !s.belegtAusnahme.some((x) => ueberlappt(x, b))) return 'ausnahme'
    return null
  }
  const suche = (von: string, bis: string, mitAusnahme: boolean): Kandidat[] => {
    const r: Kandidat[] = []
    for (const tag of tageZwischen(von, bis)) {
      const tagEnde = ms(zeitpunkt(tagPlus(tag, 1), '00:00'))
      for (let t = ms(zeitpunkt(tag, '00:00')); t + dauer <= tagEnde; t += RASTER_MIN * 60_000) {
        const s = { beginn: iso(t), ende: iso(t + dauer) }
        const eigen = stufeVon(seiten[0]!, s, t, mitAusnahme)
        const partner = eigen && stufeVon(seiten[1]!, s, t, mitAusnahme)
        if (!eigen || !partner) continue
        const tageDanach = t >= endeZeitraum ? Math.floor((t - endeZeitraum) / 86_400_000) + 1 : 0
        const punkte =
          (o.eigen.bevorzugt.some((b) => liegtIn(s, b)) ? 2 : 0) +
          (o.partner.bevorzugt.some((b) => liegtIn(s, b)) ? 2 : 0) -
          0.1 * Math.floor((t - startTag) / 86_400_000) -
          3 * [eigen, partner].filter((x) => x === 'ausnahme').length -
          0.5 * tageDanach
        r.push({ ...s, punkte: Math.round(punkte * 10) / 10, eigen, partner, tageDanach })
      }
    }
    return r.sort((a, b) => b.punkte - a.punkte || ms(a.beginn) - ms(b.beginn)).slice(0, o.anzahl ?? 5)
  }
  const stufen: [1 | 2 | 3, () => Kandidat[]][] = [
    [1, () => suche(o.von, o.bis, false)],
    [2, () => suche(o.von, o.bis, true)],
    [3, () => suche(o.bis, o.bisMax, false)],
    [3, () => suche(o.bis, o.bisMax, true)],
  ]
  for (const [stufe, f] of stufen) {
    const v = f()
    if (v.length) return { stufe, vorschlaege: v }
  }
  return { stufe: 0, vorschlaege: [] }
}

/** Gemeinsame freie Lücken je Tag (nach den normalen Regeln beider Seiten, ab Vorlauf) – für die Begründung */
export function gemeinsameLuecken(belegt: Block[], von: string, bis: string, fruehestens: number): number[] {
  const r: number[] = []
  for (const tag of tageZwischen(von, bis)) {
    for (const b of ausserhalb(belegt, tag, tagPlus(tag, 1))) {
      const min = (ms(b.ende) - Math.max(ms(b.beginn), fruehestens)) / 60_000
      if (min >= RASTER_MIN) r.push(Math.floor(min / RASTER_MIN) * RASTER_MIN)
    }
  }
  return r
}

/** ISO-Woche als „JJJJ-Www“ (Ortszeit) */
export function isoWoche(isoZeit: string): string {
  const tag = tagVon(isoZeit)
  const d = new Date(`${tag}T12:00:00Z`)
  const wt = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - wt + 3)
  const jahr = d.getUTCFullYear()
  const erster = new Date(Date.UTC(jahr, 0, 4))
  const woche = 1 + Math.round(((d.getTime() - erster.getTime()) / 86_400_000 - 3 + ((erster.getUTCDay() + 6) % 7)) / 7)
  return `${jahr}-W${String(woche).padStart(2, '0')}`
}

export type Ablehnung = 'belegt' | 'regel' | 'limit'

/** Prüft eine Anfrage gegen die eigenen Regeln und belegten Zeiten; null = in Ordnung */
export function pruefeAnfrage(o: { block: Block; regeln: Regeln; belegt: Block[]; jetzt: Date; wochenAnzahl: number }): Ablehnung | null {
  const { block: b, regeln: r } = o
  const dauerMin = (ms(b.ende) - ms(b.beginn)) / 60_000
  if (!Number.isFinite(dauerMin) || dauerMin < MIN_DAUER || dauerMin > Math.min(MAX_DAUER, r.maxDauerMin)) return 'regel'
  if (ms(b.beginn) % (RASTER_MIN * 60_000) !== 0) return 'regel'
  if (ms(b.beginn) < o.jetzt.getTime() + r.vorlaufStd * 3_600_000) return 'regel'
  if (tagVon(b.beginn) !== tagVon(iso(ms(b.ende) - 1))) return 'regel'
  if (o.wochenAnzahl >= r.maxProWoche) return 'limit'
  if (o.belegt.some((x) => ueberlappt(x, b))) return 'belegt'
  return null
}

/** Text vom Partner bereinigen: reine Daten, keine Steuerzeichen oder Markdown/YAML-Sonderzeichen */
export function sauberText(s: unknown, max = 80): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[[\]{}#|:"\\`<>*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export const istIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(s) && Number.isFinite(Date.parse(s))
export const istId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
