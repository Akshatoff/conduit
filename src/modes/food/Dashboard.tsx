import { BellRing, CheckSquare, ClipboardList, CookingPot, ListOrdered, Scale, UtensilsCrossed } from 'lucide-react'
import { ModePanel, ModeTimer, WorkflowRail, useModeState } from '../../components/mode/DashboardKit'
import { Card, Meter, Pill } from '../../components/ui'
import { cn } from '../../utils/cn'
import { FOOD_MODE } from './config'
import { KITCHEN_NOTICE, ORDERS, ORDER_STATES, QC_ITEMS, RECIPES } from './demoData'

export function FoodDashboard() {
  const state = useModeState()
  if (!state) return null
  const recipe = RECIPES[state.recipeIndex % RECIPES.length]
  const qcDone = state.checklistIndex >= QC_ITEMS.length
  const orderState = ORDER_STATES[state.orderStatus]

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg border border-[#ef8f6b]/40 bg-[#ef8f6b]/10 text-[#ef8f6b]">
            <CookingPot className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">{recipe.name}</h2>
              <Pill tone="neutral">{recipe.id}</Pill>
              <Pill tone="warn">{KITCHEN_NOTICE}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted">
              {recipe.station} · {recipe.yield} · preparation step {state.stepIndex + 1}/{recipe.steps.length}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FOOD_MODE.panels.map((p) => (
              <span key={p} className={cn('rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider', state.panel === p ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-muted')}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModePanel title="Preparation steps" icon={<UtensilsCrossed className="size-4" />} right={<Pill tone="neutral">{state.stepIndex + 1}/{recipe.steps.length}</Pill>}>
            <ol className="space-y-1.5">
              {recipe.steps.map((s, i) => (
                <li key={s} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2', i === state.stepIndex ? 'border-accent/50 bg-accent/8' : i < state.stepIndex ? 'border-teal/20 bg-teal/5' : 'border-line/50 bg-bg/30')}>
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold', i < state.stepIndex ? 'bg-teal/20 text-teal' : i === state.stepIndex ? 'bg-accent/20 text-accent' : 'bg-surface2 text-muted')}>
                    {i < state.stepIndex ? '✓' : i + 1}
                  </span>
                  <p className={cn('text-[11px]', i === state.stepIndex ? 'text-ink' : 'text-muted')}>{s}</p>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[10px] leading-snug text-muted/80">Recipe text is fictional demonstration content; it is not validated for allergens, nutrition or food safety.</p>
          </ModePanel>

          <ModePanel title="Ingredient quantities" icon={<Scale className="size-4" />} right={<Pill tone="neutral">demo</Pill>}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line/70 text-left text-muted">
                    <th className="py-2 pr-3 font-medium">Ingredient</th>
                    <th className="py-2 pr-3 font-medium">Quantity</th>
                    <th className="py-2 font-medium">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {recipe.ingredients.map((i) => (
                    <tr key={i.item}>
                      <td className="py-2 pr-3 text-ink">{i.item}</td>
                      <td className="py-2 pr-3 font-mono text-ink">{i.qty}</td>
                      <td className="py-2 text-muted">{i.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-muted/80">Fictional quantities; no scaler or nutrition calculation is provided.</p>
          </ModePanel>

          <WorkflowRail mode={FOOD_MODE} state={state} />
        </div>

        <div className="space-y-4">
          <ModeTimer state={state} />

          <ModePanel title="Quality-control checklist" icon={<CheckSquare className="size-4" />} right={<Pill tone={qcDone ? 'teal' : 'neutral'}>{state.checklistIndex}/{QC_ITEMS.length}</Pill>}>
            <ul className="space-y-1.5">
              {QC_ITEMS.map((c, i) => (
                <li key={c} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]', i < state.checklistIndex ? 'border-teal/25 bg-teal/5 text-teal' : i === state.checklistIndex ? 'border-accent/40 bg-accent/5 text-ink' : 'border-line/50 bg-bg/30 text-muted')}>
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-current text-[9px]">{i < state.checklistIndex ? '✓' : i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
            <Meter value={state.checklistIndex / QC_ITEMS.length} tone={qcDone ? 'teal' : 'accent'} label="QC progress" />
          </ModePanel>

          <ModePanel title="Order board" icon={<ListOrdered className="size-4" />} right={<Pill tone="neutral">simulated</Pill>}>
            <div className="space-y-2">
              {ORDERS.map((o, i) => {
                const active = i === 0
                return (
                  <div key={o.id} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]', active ? 'border-accent/40 bg-accent/5' : 'border-line/50 bg-bg/30')}>
                    <span className="font-mono text-muted">{o.id}</span>
                    <span className="text-ink">{o.item}</span>
                    <Pill tone={active ? (state.orderStatus === 2 ? 'teal' : 'warn') : 'neutral'} className="ml-auto">
                      {active ? orderState : o.status}
                    </Pill>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted"><ClipboardList className="size-3" /> No order system is connected; status advances only through authorised selections.</p>
          </ModePanel>

          <ModePanel title="Assistance" icon={<BellRing className="size-4" />} right={<Pill tone={state.assistance.requested ? 'warn' : 'neutral'}>{state.assistance.requested ? 'requested' : 'idle'}</Pill>}>
            <p className="text-[11px] leading-relaxed text-muted">
              {state.assistance.requested ? 'A simulated assistance request is open. No message was sent and no food-safety benefit is claimed.' : 'Select ASSIST with a deliberate approach and pinch to raise a simulated request.'}
            </p>
          </ModePanel>
        </div>
      </div>
    </div>
  )
}
