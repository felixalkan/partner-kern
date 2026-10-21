// Gemeinsame Konformitätsprüfung: jedes Partner-System lässt sie in seinen eigenen Tests gegen sich selbst laufen.
// So bleiben Argus, Minerva und alle weiteren Systeme kompatibel, auch wenn jede KI ihren Teil selbst baut.
import { angebotBereinigen } from './cowork.ts'
import { ERWEITERUNGEN, PROTOKOLL } from './protokoll.ts'
import { tagPlus } from './zeit.ts'

/** Ruft einen Pfad unter /partner/v1 beim zu prüfenden System auf (z. B. app.request in Hono, fetch, supertest …) */
export interface Antwort {
  status: number
  json(): Promise<unknown>
}
export type Aufruf = (pfad: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }) => Promise<Antwort> | Antwort

export interface Pruefpunkt {
  name: string
  ok: boolean
  fehler?: string
}

const sortiertUndGetrennt = (b: { beginn: string; ende: string }[]) => b.every((x, i) => x.beginn < x.ende && (i === 0 || b[i - 1]!.ende < x.beginn))

/**
 * Prüft ein System über seine Protokoll-Endpunkte.
 * @param schluessel gültiger Bearer-Schlüssel eines eingerichteten Partners
 * @param heute Tag (JJJJ-MM-TT), ab dem belegte Zeiten abgefragt werden
 */
export async function konformitaet(aufruf: Aufruf, schluessel: string, heute: string): Promise<Pruefpunkt[]> {
  const aus: Pruefpunkt[] = []
  const pruef = async (name: string, f: () => Promise<string | null>) => {
    try {
      const fehler = await f()
      aus.push(fehler ? { name, ok: false, fehler } : { name, ok: true })
    } catch (e) {
      aus.push({ name, ok: false, fehler: (e as Error).message })
    }
  }
  const mit = { authorization: `Bearer ${schluessel}`, 'content-type': 'application/json', accept: 'application/json' }
  const get = (pfad: string, h: Record<string, string> = mit) => aufruf(pfad, { method: 'GET', headers: h })
  const post = (pfad: string, body: unknown) => aufruf(pfad, { method: 'POST', headers: mit, body: JSON.stringify(body) })

  let erweiterungen: string[] = []
  await pruef('ohne Schlüssel: 401', async () => ((await get('/hallo', { accept: 'application/json' })).status === 401 ? null : 'erwartet 401'))
  await pruef('falscher Schlüssel: 401', async () => ((await get('/hallo', { ...mit, authorization: 'Bearer falsch' })).status === 401 ? null : 'erwartet 401'))
  await pruef('hallo: protokoll, system, name', async () => {
    const r = await get('/hallo')
    const d = (await r.json()) as Record<string, unknown>
    if (r.status !== 200) return `Status ${r.status}`
    if (d.protokoll !== PROTOKOLL) return `protokoll ist ${String(d.protokoll)}`
    if (typeof d.system !== 'string' || typeof d.name !== 'string') return 'system/name fehlen'
    erweiterungen = Array.isArray(d.erweiterungen) ? d.erweiterungen.filter((x): x is string => typeof x === 'string') : []
    const fremd = erweiterungen.filter((x) => !(ERWEITERUNGEN as readonly string[]).includes(x))
    return fremd.length ? `unbekannte Erweiterungen: ${fremd.join(', ')}` : null
  })
  await pruef('belegt: sortierte, getrennte Blöcke ohne Details', async () => {
    const r = await post('/belegt', { von: heute, bis: tagPlus(heute, 7) })
    const d = (await r.json()) as Record<string, unknown>
    if (r.status !== 200) return `Status ${r.status}`
    const belegt = d.belegt as { beginn: string; ende: string }[]
    if (!Array.isArray(belegt) || !Array.isArray(d.bevorzugt)) return 'belegt/bevorzugt fehlen'
    if (!sortiertUndGetrennt(belegt)) return 'Blöcke nicht zusammengefasst oder unsortiert'
    if (belegt.some((b) => Object.keys(b).some((k) => k !== 'beginn' && k !== 'ende'))) return 'Blöcke enthalten mehr als beginn/ende'
    if (erweiterungen.includes('ausweichen') && !Array.isArray(d.belegtAusnahme)) return 'ausweichen gemeldet, aber belegtAusnahme fehlt'
    return null
  })
  await pruef('belegt: Zeitraum über 31 Tage → 400', async () => ((await post('/belegt', { von: heute, bis: tagPlus(heute, 40) })).status === 400 ? null : 'erwartet 400'))
  if (erweiterungen.includes('cowork'))
    await pruef('cowork: Angebot ist schon bereinigt, ohne Pfade', async () => {
      const r = await get('/cowork')
      if (r.status !== 200) return `Status ${r.status}`
      const roh = await r.json()
      const sauber = angebotBereinigen(roh)
      const d = roh as Record<string, unknown[]>
      for (const k of ['kalender', 'todos', 'nachrichten'] as const)
        if ((Array.isArray(d[k]) ? d[k].length : 0) !== sauber[k].length) return `${k}: Einträge, die die Bereinigung verwirft`
      return /\.md\b|\/Users\/|[A-Z]:\\\\/.test(JSON.stringify(roh)) ? 'enthält Pfade' : null
    })
  return aus
}
