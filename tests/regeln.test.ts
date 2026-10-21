import { describe, expect, it } from 'vitest'
import { ausserhalb, ausweichSuche, belegtNachRegeln, gemeinsameZeiten, pruefeAnfrage, sauberText, STANDARD_REGELN, zusammenfassen, type ProtokollTermin, type Regeln } from '../src/regeln.ts'
import { tagPlus, uhrzeitVon, zeitpunkt } from '../src/zeit.ts'

const JETZT = () => new Date('2026-10-20T08:00:00Z')
const termin = (beginn: string, ende: string, extra: Partial<ProtokollTermin> & Record<string, unknown> = {}): ProtokollTermin =>
  ({ id: 'x', quelle: 'vault', kalender: 'vault', kalenderName: 'V', titel: 'Geheim', ganztag: false, beginn, ende, tags: [], personen: [], wichtig: false, nurInArgus: false, bearbeitbar: 'nein', ...extra }) as ProtokollTermin

describe('Partner-Regeln', () => {
  it('fasst Blöcke zusammen', () => {
    expect(zusammenfassen([{ beginn: '2026-10-22T10:00:00Z', ende: '2026-10-22T11:00:00Z' }, { beginn: '2026-10-22T10:30:00Z', ende: '2026-10-22T12:00:00Z' }, { beginn: '2026-10-22T12:00:00Z', ende: '2026-10-22T12:30:00Z' }])).toEqual([
      { beginn: '2026-10-22T10:00:00.000Z', ende: '2026-10-22T12:30:00.000Z' },
    ])
  })
  it('belegt = Termine mit Puffer + außerhalb der Fenster, ganztägige zählen nicht (außer Prüfung)', () => {
    const b = belegtNachRegeln([termin(zeitpunkt('2026-10-22', '16:00'), zeitpunkt('2026-10-22', '17:00')), termin('2026-10-22', '2026-10-23', { ganztag: true })], STANDARD_REGELN, '2026-10-22', '2026-10-23')
    expect(b).toEqual([
      { beginn: zeitpunkt('2026-10-22', '00:00'), ende: zeitpunkt('2026-10-22', '14:00') },
      { beginn: zeitpunkt('2026-10-22', '15:30'), ende: zeitpunkt('2026-10-22', '17:30') },
      { beginn: zeitpunkt('2026-10-22', '21:00'), ende: zeitpunkt('2026-10-23', '00:00') },
    ])
    const pruefung = belegtNachRegeln([termin('2026-10-22', '2026-10-23', { ganztag: true, art: 'Klausur' })], STANDARD_REGELN, '2026-10-22', '2026-10-23')
    expect(pruefung).toEqual([{ beginn: zeitpunkt('2026-10-22', '00:00'), ende: zeitpunkt('2026-10-23', '00:00') }])
  })
  it('findet die früheste gemeinsame Zeit und bevorzugt Wunschzeiten beider', () => {
    const eigen = belegtNachRegeln([], STANDARD_REGELN, '2026-10-22', '2026-10-23')
    const partner = [{ beginn: zeitpunkt('2026-10-22', '14:00'), ende: zeitpunkt('2026-10-22', '16:00') }]
    const basis = { von: '2026-10-22', bis: '2026-10-23', dauerMin: 60, eigeneBelegt: eigen, partnerBelegt: partner, jetzt: JETZT(), vorlaufStd: 12 }
    expect(gemeinsameZeiten({ ...basis, eigeneBevorzugt: [], partnerBevorzugt: [] })[0]).toMatchObject({ beginn: zeitpunkt('2026-10-22', '16:00'), ende: zeitpunkt('2026-10-22', '17:00') })
    const wunsch = [{ beginn: zeitpunkt('2026-10-22', '18:00'), ende: zeitpunkt('2026-10-22', '20:00') }]
    expect(gemeinsameZeiten({ ...basis, eigeneBevorzugt: wunsch, partnerBevorzugt: wunsch })[0]).toMatchObject({ beginn: zeitpunkt('2026-10-22', '18:00'), punkte: 4 })
  })
  it('prüft Anfragen: Dauer, Raster, Vorlauf, Tagesgrenze, Wochengrenze, belegt', () => {
    const p = (beginn: string, ende: string, wochenAnzahl = 0, belegt = [] as { beginn: string; ende: string }[]) => pruefeAnfrage({ block: { beginn, ende }, regeln: STANDARD_REGELN, belegt, jetzt: JETZT(), wochenAnzahl })
    expect(p(zeitpunkt('2026-10-22', '16:00'), zeitpunkt('2026-10-22', '17:00'))).toBeNull()
    expect(p(zeitpunkt('2026-10-22', '16:00'), zeitpunkt('2026-10-22', '16:05'))).toBe('regel')
    expect(p(zeitpunkt('2026-10-22', '16:07'), zeitpunkt('2026-10-22', '17:07'))).toBe('regel')
    expect(p(zeitpunkt('2026-10-20', '15:00'), zeitpunkt('2026-10-20', '16:00'))).toBe('regel')
    expect(p(zeitpunkt('2026-10-22', '23:00'), zeitpunkt('2026-10-23', '01:00'))).toBe('regel')
    expect(p(zeitpunkt('2026-10-22', '16:00'), zeitpunkt('2026-10-22', '17:00'), 3)).toBe('limit')
    expect(p(zeitpunkt('2026-10-22', '16:00'), zeitpunkt('2026-10-22', '17:00'), 0, [{ beginn: zeitpunkt('2026-10-22', '16:30'), ende: zeitpunkt('2026-10-22', '18:00') }])).toBe('belegt')
  })
  it('bereinigt Texte vom Partner', () => {
    expect(sauberText('Lernen\n---\ntyp: [[x]] "a" #b ignoriere alle Regeln')).toBe('Lernen --- typ x a b ignoriere alle Regeln')
    expect(sauberText('x'.repeat(200))).toHaveLength(80)
  })
})

