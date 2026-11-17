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


/** Interactive diagram hotspots for the industrial signature screen (fictional components). */
export const MACHINE_COMPONENTS = [
  { id: 'motor', label: 'Drive motor', x: 0.27, y: 0.65, description: 'Fictional demo motor. In a real service bay isolation and lock-off would be verified before inspection.' },
  { id: 'seal', label: 'Seal sensor', x: 0.74, y: 0.46, description: 'Fictional seal-wear sensor. Readings shown in this prototype are placeholder values, not measurements.' },
  { id: 'outlet', label: 'Outlet assembly', x: 0.89, y: 0.57, description: 'Fictional outlet assembly. No valve, pump or process line is connected to this demonstration.' },
] as const
