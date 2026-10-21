// Zeit-Hilfen des Protokolls: ISO in UTC, Tage als JJJJ-MM-TT in Europe/Berlin (Kopie aus Argus, hier maßgeblich).
import { addDays, format, parseISO } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const HEIM = 'Europe/Berlin'

export const istDatum = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const istUhrzeit = (s: unknown): s is string => typeof s === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s)

/** Ortszeit (Datum + HH:MM in Zone) → UTC-ISO */
export function zeitpunkt(datum: string, uhrzeit: string, zone = HEIM): string {
  const [h, m] = uhrzeit.split(':')
  return fromZonedTime(`${datum}T${h!.padStart(2, '0')}:${m}:00`, zone).toISOString()
}

export function tagPlus(datum: string, tage: number): string {
  return format(addDays(parseISO(datum), tage), 'yyyy-MM-dd')
}

/** Kalendertag eines Zeitpunkts in Berlin */
export function tagVon(iso: string): string {
  return formatInTimeZone(new Date(iso), HEIM, 'yyyy-MM-dd')
}

export function uhrzeitVon(iso: string): string {
  return formatInTimeZone(new Date(iso), HEIM, 'HH:mm')
}

/** Tage von (einschließlich) bis (ausschließlich) */
export function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = []
  for (let d = von; d < bis; d = tagPlus(d, 1)) tage.push(d)
  return tage
}

/** Wochentag 1 = Montag … 7 = Sonntag */
export function wochentag(datum: string): number {
  const w = parseISO(datum).getDay()
  return w === 0 ? 7 : w
}
