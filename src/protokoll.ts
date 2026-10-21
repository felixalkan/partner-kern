// Version und Erweiterungen des Partner-Protokolls. Jede Änderung hier betrifft alle Partner-Systeme.
export const PROTOKOLL = 1
/** Erweiterungen, die dieses Paket beschreibt und die ein System in /hallo melden darf */
export const ERWEITERUNGEN = ['ausweichen', 'cowork'] as const
export type Erweiterung = (typeof ERWEITERUNGEN)[number]

export interface Hallo {
  protokoll: typeof PROTOKOLL
  system: string
  name: string
  erweiterungen?: string[]
}
