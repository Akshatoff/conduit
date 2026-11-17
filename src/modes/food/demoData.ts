// Fictional recipes and orders for the kitchen demonstration. No food-safety claim is made.

export const KITCHEN_NOTICE = 'FICTIONAL RECIPES AND ORDERS — demonstration only.'

export const RECIPES = [
  {
    id: 'R-DEMO-1',
    name: 'Demo herb flatbread',
    station: 'Simulated prep station 1',
    yield: '4 portions (demo)',
    ingredients: [
      { item: 'Demo flour blend', qty: '320', unit: 'g' },
      { item: 'Water', qty: '210', unit: 'ml' },
      { item: 'Demo herb mix', qty: '12', unit: 'g' },
      { item: 'Salt', qty: '4', unit: 'g' },
    ],
    steps: [
      'Weigh the demo ingredients',
      'Combine and rest the dough (demo timing)',
      'Shape four demo portions',
      'Bake at the simulated station setting',
      'Cool and label the demo tray',
    ],
  },
  {
    id: 'R-DEMO-2',
    name: 'Demo vegetable traybake',
    station: 'Simulated prep station 2',
    yield: '6 portions (demo)',
    ingredients: [
      { item: 'Demo vegetables', qty: '900', unit: 'g' },
      { item: 'Oil', qty: '30', unit: 'ml' },
      { item: 'Demo spice mix', qty: '9', unit: 'g' },
    ],
    steps: ['Prepare the demo vegetables', 'Coat with oil and demo spice', 'Load the simulated tray', 'Bake and check at the demo checkpoint'],
  },
  {
    id: 'R-DEMO-3',
    name: 'Demo chilled dessert',
    station: 'Simulated cold prep',
    yield: '8 portions (demo)',
    ingredients: [
      { item: 'Demo dairy base', qty: '500', unit: 'ml' },
      { item: 'Sugar', qty: '60', unit: 'g' },
      { item: 'Demo fruit', qty: '200', unit: 'g' },
    ],
    steps: ['Combine the demo base', 'Portion into demo cups', 'Chill and label', 'Record the demo batch'],
  },
]

export const QC_ITEMS = [
  'Demo surface check complete',
  'Demo ingredient quantities verified',
  'Demo station temperature noted',
  'Demo batch label applied',
  'Demo order status updated',
]

export const ORDERS = [
  { id: 'ORD-001', item: 'Demo flatbread × 2', status: 'Queued' },
  { id: 'ORD-002', item: 'Demo traybake × 1', status: 'Queued' },
  { id: 'ORD-003', item: 'Demo dessert × 4', status: 'Queued' },
]

export const ORDER_STATES = ['Queued', 'Preparing', 'Ready'] as const
