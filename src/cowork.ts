// Cowork (Partner-Protokoll v1.2 „cowork“): Datenformat, Bereinigung und Zusammenführen – gleich in allen Systemen.
// Jede Seite stellt nur bereit, was sie selbst geteilt oder geschrieben hat (GET /partner/v1/cowork) und holt den Rest
// beim Partner ab. Der Partner kann bei uns nichts speichern; alles von ihm ist reiner Text (bereinigt, nie an die KI).
import { istId, istIso } from './regeln.ts'
import { istDatum } from './zeit.ts'

export const COWORK_TAGE_ZURUECK = 7
export const COWORK_TAGE_VOR = 31
export const MAX_NACHRICHTEN = 200
export const MAX_TODOS = 200

export interface CoworkTermin {
  id: string
  titel: string
  kalender: string
  ganztag: boolean
  beginn: string
  ende: string
}

export interface CoworkTodo {
  id: string
  /** aus Sicht der Seite, die das To-do angelegt hat */
  fuer: 'du' | 'ich'
  text: string
  faellig?: string
  erstellt: string
}

export interface Haken {
  erledigt: boolean
  zeit: string
}

/** Was eine Seite dem Partner bereitstellt */
export interface CoworkAngebot {
  protokoll: 1
  name: string
  kalender: CoworkTermin[]
  todos: CoworkTodo[]
  haken: Record<string, Haken>
  notiz: { text: string; zeit: string } | null
  nachrichten: { id: string; text: string; zeit: string }[]
}

/** Eigener gespeicherter Stand (Speicherort wählt jedes System selbst) */
export interface CoworkStand {
  freigabe: Record<string, string[]>
  todos: (CoworkTodo & { partnerId: string })[]
  haken: Record<string, Record<string, Haken>>
  notiz: Record<string, { text: string; zeit: string }>
  nachrichten: { id: string; partnerId: string; text: string; zeit: string }[]
  abgeholt: Record<string, { zeit: string; angebot: CoworkAngebot }>
}

export interface CoworkSicht {
  id: string
  name: string
  verbunden: boolean
  abgeholt: string | null
  fehler: string | null
  freigabe: string[]
  kalender: (CoworkTermin & { von: 'ich' | 'partner' })[]
  todos: { id: string; von: 'ich' | 'partner'; fuer: 'ich' | 'partner'; text: string; faellig?: string; erstellt: string; erledigt: boolean; erledigtVon: 'ich' | 'partner' | null }[]
  notiz: { text: string; zeit: string; von: 'ich' | 'partner' } | null
  nachrichten: { id: string; von: 'ich' | 'partner'; text: string; zeit: string }[]
}

/** Längerer Text vom Partner oder aus der Oberfläche: nur Steuerzeichen raus (Zeilenumbrüche bleiben), begrenzt */
export function sauberLang(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}
export const kurz = (s: unknown, max: number) => sauberLang(s, max).replace(/\s+/g, ' ')
const istTagOderIso = (s: unknown): s is string => istDatum(s) || istIso(s)

/** Angebot des Partners prüfen und bereinigen – alles Unbekannte fällt weg */
export function angebotBereinigen(roh: unknown): CoworkAngebot {
  const d = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const liste = (x: unknown) => (Array.isArray(x) ? x : []).filter((y): y is Record<string, unknown> => !!y && typeof y === 'object')
  const haken: Record<string, Haken> = {}
  for (const [id, h] of Object.entries((d.haken && typeof d.haken === 'object' ? d.haken : {}) as Record<string, Record<string, unknown>>).slice(0, 500))
    if (istId(id) && h && typeof h.erledigt === 'boolean' && istIso(h.zeit)) haken[id] = { erledigt: h.erledigt, zeit: h.zeit }
  const notiz = d.notiz as Record<string, unknown> | null | undefined
  return {
    protokoll: 1,
    name: kurz(d.name, 40),
    kalender: liste(d.kalender)
      .filter((t) => istTagOderIso(t.beginn) && istTagOderIso(t.ende))
      .slice(0, 500)
      .map((t) => ({ id: kurz(t.id, 40), titel: kurz(t.titel, 120) || 'Termin', kalender: kurz(t.kalender, 60), ganztag: t.ganztag === true, beginn: t.beginn as string, ende: t.ende as string })),
    todos: liste(d.todos)
      .filter((t) => istId(t.id) && (t.fuer === 'du' || t.fuer === 'ich') && istIso(t.erstellt))
      .slice(0, MAX_TODOS)
      .map((t) => ({ id: t.id as string, fuer: t.fuer as 'du' | 'ich', text: kurz(t.text, 200) || 'To-do', ...(istDatum(t.faellig) ? { faellig: t.faellig } : {}), erstellt: t.erstellt as string })),
    haken,
    notiz: notiz && typeof notiz === 'object' && istIso(notiz.zeit) ? { text: sauberLang(notiz.text, 5000), zeit: notiz.zeit } : null,
    nachrichten: liste(d.nachrichten)
      .filter((n) => istId(n.id) && istIso(n.zeit))
      .slice(-MAX_NACHRICHTEN)
      .map((n) => ({ id: n.id as string, text: sauberLang(n.text, 1000), zeit: n.zeit as string }))
      .filter((n) => n.text),
  }
}

/** Eigenen Stand und abgeholtes Angebot zu einer Sicht zusammenführen (reine Funktion, für Tests) */
export function zusammenfuehren(p: { id: string; name: string; verbunden: boolean }, s: CoworkStand, eigeneKalender: CoworkTermin[], fehler: string | null): CoworkSicht {
  const fremd = s.abgeholt[p.id]?.angebot
  const meineHaken = s.haken[p.id] ?? {}
  const seineHaken = fremd?.haken ?? {}
  const status = (id: string): { erledigt: boolean; erledigtVon: 'ich' | 'partner' | null } => {
    const a = meineHaken[id]
    const b = seineHaken[id]
    const neuer: 'ich' | 'partner' | null = a && b ? (a.zeit >= b.zeit ? 'ich' : 'partner') : a ? 'ich' : b ? 'partner' : null
    const h = neuer === 'ich' ? a : neuer === 'partner' ? b : undefined
    return { erledigt: h?.erledigt ?? false, erledigtVon: h?.erledigt ? neuer : null }
  }
  const todos: CoworkSicht['todos'] = [
    ...s.todos.filter((t) => t.partnerId === p.id).map((t) => ({ id: t.id, von: 'ich' as const, fuer: t.fuer === 'du' ? ('partner' as const) : ('ich' as const), text: t.text, faellig: t.faellig, erstellt: t.erstellt, ...status(t.id) })),
    ...(fremd?.todos ?? []).map((t) => ({ id: t.id, von: 'partner' as const, fuer: t.fuer === 'du' ? ('ich' as const) : ('partner' as const), text: t.text, faellig: t.faellig, erstellt: t.erstellt, ...status(t.id) })),
  ].sort((a, b) => Number(a.erledigt) - Number(b.erledigt) || (a.faellig ?? '9').localeCompare(b.faellig ?? '9') || b.erstellt.localeCompare(a.erstellt))
  const meine = s.notiz[p.id]
  const seine = fremd?.notiz ?? null
  const notiz = meine && (!seine || meine.zeit >= seine.zeit) ? { ...meine, von: 'ich' as const } : seine ? { ...seine, von: 'partner' as const } : null
  return {
    id: p.id,
    name: p.name,
    verbunden: p.verbunden,
    abgeholt: s.abgeholt[p.id]?.zeit ?? null,
    fehler,
    freigabe: s.freigabe[p.id] ?? [],
    kalender: [...eigeneKalender.map((t) => ({ ...t, von: 'ich' as const })), ...(fremd?.kalender ?? []).map((t) => ({ ...t, von: 'partner' as const }))].sort((a, b) => a.beginn.localeCompare(b.beginn)),
    todos,
    notiz,
    nachrichten: [
      ...s.nachrichten.filter((n) => n.partnerId === p.id).map((n) => ({ id: n.id, von: 'ich' as const, text: n.text, zeit: n.zeit })),
      ...(fremd?.nachrichten ?? []).map((n) => ({ ...n, von: 'partner' as const })),
    ].sort((a, b) => a.zeit.localeCompare(b.zeit)),
  }
}

