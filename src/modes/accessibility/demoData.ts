// Neutral demonstration content for the adaptive interaction mode.

export const ACCESSIBILITY_NOTICE = 'Demonstration content — adapt the settings to your own scenario.'

export const CONTENT_ITEMS = [
  { id: 'A', title: 'Demo panel A', body: 'A large, low-clutter panel. Selecting it records one deliberate choice in the interaction history.' },
  { id: 'B', title: 'Demo panel B', body: 'Another demonstration panel. The focus ring moves only when you select NEXT.' },
  { id: 'C', title: 'Demo panel C', body: 'This panel exists to show how a larger control surface reduces the precision needed.' },
  { id: 'D', title: 'Demo panel D', body: 'The final demo panel. All four use the same shared Intent Engine as every other mode.' },
]

export const SETTING_HINTS = [
  'Longer dwell gives more time to hold a steady hand — at the cost of speed.',
  'A lower confidence threshold accepts more movements; a higher one rejects more.',
  'A different confirmation gesture can suit a hand that cannot pinch reliably.',
  'Larger controls are easier to reach but cover more of the camera view.',
]
