import { describe, expect, it } from 'vitest'
import { angebotBereinigen, konformitaet, sauberLang, zusammenfuehren, type Aufruf, type CoworkStand } from '../src/index.ts'

const antwort = (status: number, d: unknown) => ({ status, json: async () => d })

/** Kleines Vorbild-System, an dem die Prüfung selbst getestet wird */
function system(o: { cowork?: unknown; belegt?: unknown } = {}): Aufruf {
  return async (pfad, init) => {
    if (init.headers.authorization !== 'Bearer gut') return antwort(401, { protokoll: 1, ok: false })
    if (pfad === '/hallo') return antwort(200, { protokoll: 1, system: 'test', name: 'T', erweiterungen: ['ausweichen', 'cowork'] })
    if (pfad === '/belegt') {
      const b = JSON.parse(init.body!) as { von: string; bis: string }
      if (b.bis > '2026-11-15') return antwort(400, { protokoll: 1, ok: false })
      return antwort(200, o.belegt ?? { protokoll: 1, belegt: [{ beginn: '2026-10-22T10:00:00.000Z', ende: '2026-10-22T11:00:00.000Z' }], bevorzugt: [], belegtAusnahme: [] })
    }
    if (pfad === '/cowork') return antwort(200, o.cowork ?? { protokoll: 1, name: 'T', kalender: [], todos: [], haken: {}, notiz: null, nachrichten: [] })
    return antwort(404, {})
  }
}

describe('Konformität', () => {
  it('ein korrektes System besteht alle Punkte', async () => {
    const p = await konformitaet(system(), 'gut', '2026-10-20')
    expect(p.filter((x) => !x.ok)).toEqual([])
    expect(p.length).toBeGreaterThanOrEqual(6)
  })
  it('findet Fehler: Details in belegt, Pfade im Cowork-Angebot', async () => {
    const p = await konformitaet(
      system({
        belegt: { protokoll: 1, belegt: [{ beginn: '2026-10-22T10:00:00.000Z', ende: '2026-10-22T11:00:00.000Z', titel: 'Geheim' }], bevorzugt: [], belegtAusnahme: [] },
        cowork: { protokoll: 1, name: 'T', kalender: [{ id: 'v:/Users/x/Termin.md', titel: 'X', kalender: 'K', ganztag: false, beginn: '2026-10-22T10:00:00Z', ende: '2026-10-22T11:00:00Z' }], todos: [], haken: {}, notiz: null, nachrichten: [] },
      }),
      'gut',
      '2026-10-20',
    )
    expect(p.filter((x) => !x.ok).map((x) => x.name)).toEqual(['belegt: sortierte, getrennte Blöcke ohne Details', 'cowork: Angebot ist schon bereinigt, ohne Pfade'])
  })
})

describe('Cowork-Kern', () => {
  it('bereinigt und führt zusammen; jüngster Haken und jüngere Notiz gewinnen', () => {
    const id = '3f2b8f8e-1c1d-4a5e-9f00-000000000001'
    const fremd = angebotBereinigen({
      name: 'Max',
      todos: [{ id, fuer: 'du', text: 'Folien', erstellt: '2026-10-20T08:00:00Z' }],
      haken: { [id]: { erledigt: true, zeit: '2026-10-20T09:00:00Z' } },
      notiz: { text: 'neu', zeit: '2026-10-20T10:00:00Z' },
      nachrichten: [{ id, text: 'Hi\u0007', zeit: '2026-10-20T08:00:00Z' }],
    })
    const stand: CoworkStand = { freigabe: {}, todos: [], haken: { max: { [id]: { erledigt: false, zeit: '2026-10-20T08:30:00Z' } } }, notiz: { max: { text: 'alt', zeit: '2026-10-20T07:00:00Z' } }, nachrichten: [], abgeholt: { max: { zeit: '2026-10-20T10:00:00Z', angebot: fremd } } }
    const s = zusammenfuehren({ id: 'max', name: 'Max', verbunden: true }, stand, [], null)
    expect(s.todos[0]).toMatchObject({ von: 'partner', fuer: 'ich', erledigt: true, erledigtVon: 'partner' })
    expect(s.notiz).toMatchObject({ von: 'partner', text: 'neu' })
    expect(s.nachrichten[0]).toMatchObject({ von: 'partner', text: 'Hi' })
    expect(sauberLang('a\r\n\n\n\nb', 10)).toBe('a\n\nb')
  })
})
