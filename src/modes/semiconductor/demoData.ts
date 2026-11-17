// Fictional semiconductor demonstration data. Nothing here reflects a real fab, wafer or process.

export const FAB_NOTICE = 'SIMULATED FABRICATION SCENARIO — fictional wafer and process data.'

export const PROCESS_STAGES = [
  { id: 'litho', name: 'Lithography', code: 'LITHO-01', detail: 'Simulated resist exposure step for the demonstration wafer.' },
  { id: 'etch', name: 'Etch', code: 'ETCH-02', detail: 'Simulated pattern transfer step.' },
  { id: 'depo', name: 'Deposition', code: 'DEPO-03', detail: 'Simulated thin-film deposition step.' },
  { id: 'cmp', name: 'Planarisation', code: 'CMP-04', detail: 'Simulated planarisation step.' },
  { id: 'inspect', name: 'Final inspection', code: 'INSP-05', detail: 'Simulated inspection stage — confirms the demo record.' },
]

export const DEFECT_CATEGORIES = [
  { id: 'particle', label: 'Particle', note: 'Fictional sample category' },
  { id: 'scratch', label: 'Scratch', note: 'Fictional sample category' },
  { id: 'pattern', label: 'Pattern defect', note: 'Fictional sample category' },
  { id: 'edge', label: 'Edge chip', note: 'Fictional sample category' },
]

/** Deterministic fictional die map (no measurement is implied). */
export const WAFER_DIES = Array.from({ length: 37 }, (_, i) => ({
  id: `D${String(i + 1).padStart(2, '0')}`,
  // a fixed pseudo-pattern so the map looks like a wafer but is identical on every run
  state: i % 11 === 0 ? 'flagged' : i % 7 === 0 ? 'review' : 'ok',
}))

export const EQUIPMENT = [
  { id: 'EQ-01', name: 'Simulated process tool', indicator: 'LED · lighting node', reading: '23.4 °C', state: 'Nominal (simulated)' },
  { id: 'EQ-02', name: 'Simulated ventilation', indicator: 'Fan · ventilation node', reading: '0.42 m/s', state: 'Filtered airflow (simulated)' },
  { id: 'EQ-03', name: 'Model access latch', indicator: 'Servo · access node', reading: '—', state: 'Closed (simulated)' },
]

export const CHECKLIST = [
  'Confirm demonstration lot identifier',
  'Verify the simulated process stage',
  'Open the fictional wafer inspection image',
  'Select a sample defect category',
  'Confirm the simulated inspection record',
]
