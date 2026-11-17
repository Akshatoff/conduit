// Fictional demonstration data. No real patient records, no diagnoses, no identifiers.

export interface DemoPatient {
  id: string
  label: string
  age: string
  sex: string
  location: string
  status: string
  summary: string
  vitals: { label: string; value: string; unit: string; note: string }[]
  notes: string[]
  records: { time: string; kind: string; entry: string; author: string }[]
}

export const DEMO_NOTICE = 'FICTIONAL DEMONSTRATION DATA — not a patient record, not a diagnosis.'

export const PATIENTS: DemoPatient[] = [
  {
    id: 'DEMO-0001',
    label: 'Demo Patient A',
    age: '68',
    sex: 'F',
    location: 'Demo ward · bed 1',
    status: 'Stable · routine review',
    summary: 'Fictional post-operative review scenario used to demonstrate navigation only.',
    vitals: [
      { label: 'Heart rate', value: '78', unit: 'bpm', note: 'demo value' },
      { label: 'Blood pressure', value: '126/78', unit: 'mmHg', note: 'demo value' },
      { label: 'SpO₂', value: '97', unit: '%', note: 'demo value' },
      { label: 'Temperature', value: '36.8', unit: '°C', note: 'demo value' },
    ],
    notes: [
      'Fictional note: mobilising with assistance, review planned for the next round.',
      'Fictional note: family update documented by demonstration user.',
      'Fictional note: no changes to the standing care plan in this scenario.',
    ],
    records: [
      { time: '08:10', kind: 'Observation', entry: 'Routine observations recorded (demo values)', author: 'Demo Nurse 1' },
      { time: '07:40', kind: 'Note', entry: 'Overnight summary placeholder text for the demo', author: 'Demo Nurse 2' },
      { time: 'Yesterday', kind: 'Review', entry: 'Demonstration review entry — no clinical meaning', author: 'Demo Clinician' },
    ],
  },
  {
    id: 'DEMO-0002',
    label: 'Demo Patient B',
    age: '54',
    sex: 'M',
    location: 'Demo ward · bed 2',
    status: 'Awaiting demonstration review',
    summary: 'Second fictional record used to show navigation between patients.',
    vitals: [
      { label: 'Heart rate', value: '84', unit: 'bpm', note: 'demo value' },
      { label: 'Blood pressure', value: '132/84', unit: 'mmHg', note: 'demo value' },
      { label: 'SpO₂', value: '96', unit: '%', note: 'demo value' },
      { label: 'Temperature', value: '37.1', unit: '°C', note: 'demo value' },
    ],
    notes: ['Fictional note: awaiting a demonstration information panel.'],
    records: [
      { time: '09:05', kind: 'Observation', entry: 'Demo observation entry', author: 'Demo Nurse 1' },
      { time: '08:20', kind: 'Task', entry: 'Demo task marked complete in the scenario', author: 'Demo Support' },
    ],
  },
  {
    id: 'DEMO-0003',
    label: 'Demo Patient C',
    age: '41',
    sex: 'X',
    location: 'Demo day unit',
    status: 'Ready for demonstration step',
    summary: 'Third fictional record; identical structure, different placeholder values.',
    vitals: [
      { label: 'Heart rate', value: '72', unit: 'bpm', note: 'demo value' },
      { label: 'Blood pressure', value: '118/72', unit: 'mmHg', note: 'demo value' },
      { label: 'SpO₂', value: '98', unit: '%', note: 'demo value' },
      { label: 'Temperature', value: '36.6', unit: '°C', note: 'demo value' },
    ],
    notes: ['Fictional note: demonstration day-unit handover.'],
    records: [{ time: '09:30', kind: 'Handover', entry: 'Demo handover text', author: 'Demo Clinician' }],
  },
]
