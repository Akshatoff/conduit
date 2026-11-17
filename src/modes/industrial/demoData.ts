// Fictional field-maintenance demonstration data. No real machinery, no safety system.

export const FIELD_NOTICE = 'SIMULATED EQUIPMENT — fictional readings for demonstration only.'

export const EQUIPMENT_UNIT = {
  id: 'PUMP-DEMO-07',
  name: 'Demo circulation pump',
  location: 'Simulated plant room · service bay 2',
  assetTag: 'DEMO-ASSET-0007',
}

export const READINGS = [
  { label: 'Discharge pressure', value: '4.2', unit: 'bar', state: 'within demo band' },
  { label: 'Bearing vibration', value: '1.8', unit: 'mm/s', state: 'within demo band' },
  { label: 'Motor temperature', value: '58', unit: '°C', state: 'within demo band' },
  { label: 'Run hours', value: '1,284', unit: 'h', state: 'since demo service' },
  { label: 'Seal leak sensor', value: 'Dry', unit: '', state: 'simulated contact' },
]

export const MANUAL_STEPS = [
  { id: 'iso', title: 'Isolate and lock off (simulated)', detail: 'In a real plant this is a permit-controlled task. Here it is placeholder text.' },
  { id: 'inspect', title: 'Inspect coupling guard', detail: 'Check the displayed diagram for the demonstration inspection point.' },
  { id: 'vibration', title: 'Take vibration reading', detail: 'Compare with the simulated reading shown on the dashboard.' },
  { id: 'seal', title: 'Check seal leak sensor', detail: 'Confirm the simulated sensor status.' },
  { id: 'restore', title: 'Restore and record', detail: 'Mark the demonstration maintenance step complete.' },
]

export const INSPECTION_STEPS = [
  'Confirm demo asset tag',
  'Review simulated readings',
  'Inspect the equipment diagram',
  'Record a simulated observation',
  'Request assistance if needed',
]
