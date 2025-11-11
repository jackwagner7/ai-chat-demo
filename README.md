This project starts from a vanilla [Next.js](https://nextjs.org) `app/` scaffold but layers on a mini “AI dashboard” experience. Rather than keep all logic in `app/page.tsx`, we push behavior into the following folders:

### Core flow
- `app/page.tsx`: composes the viewport, CSV uploader, chat panel, and board surface. References the board viewport hook plus the card history/creation/SQL helpers to keep the template focused on layout.
- `components/Card`: renders a card grid, delegates per-card rendering to `CardView`, and surfaces `CardSettings`.
- `components/Card/Settings`: split into
  - `Sections/`: collapsible panels (graph settings, axes, legend, title background, measure appearance).
  - `Inputs/`: reusable SQL runners and the title input.
  - `utils`: shared helpers such as `ensureSeriesDisplayNames`/`ensureSegmentColors`.

### Hook responsibilities
- `hooks/useBoardViewport.ts`: pan/zoom state with persistence.
- `hooks/useDashboardState.ts`: dataset upload, storage, and cleanup (now imports `ensureCardLayout` from `lib/cardLayout.ts`).
- `hooks/useCardHistory.ts`: undo/redo and history tracking.
- `hooks/useCardSqlActions.ts`: runs SQL for measures/charts and updates cards.
- `hooks/useCardCreation.ts`: handles new card creation logic, placement, and color assignment.
- `hooks/useAssistantPatches.ts`: applies assistant patches via `applyPatchInstructionToCard`.
- `hooks/useChatOrchestrator.ts`: drives the chat flow (unchanged).

### Utilities
- `lib/cardLayout.ts`: shared helpers for computing layouts and applying patch instructions.
- `lib/cardPlacement.ts`, `lib/cardFormatting.ts`, `lib/cardPatches.ts`, `lib/chartHelpers.ts`: existing helpers remain the same but are now consumed by the new hooks.

### Adding a new card type
1. **Data & types**: extend `CardKind`, card settings, and any helper types in `types/index.ts`.
2. **Card creation**: add creation logic to `hooks/useCardCreation.ts` (or a dedicated hook) similar to the measure/chart flows; reuse `seedCardFormatting`, `computeCardPlacement`, etc.
3. **Settings UI**: create new section/input components inside `components/Card/Settings/Sections` or `Inputs`, export them from the folder index, and plug them into `CardSettings.tsx`.
4. **Rendering**: update `CardView.tsx`/`CardContainer.tsx` with the new kind’s visual representation and settings link.
5. **SQL/assistant support**: If the card uses SQL, extend `hooks/useCardSqlActions.ts` (and possibly `useCardCreation`) to fetch data, and make sure `useChatOrchestrator.ts`/`useAssistantPatches.ts` understand the new kind.
6. **Storage**: let `useDashboardState.ts` persist/restore the card shape and drop any references to deleted datasets.

### Settings visibility
`components/Card/Settings/CardSettings.tsx` dictates which sections are shown per card kind. The current mapping is:

| Card kind   | Visible sections/title inputs |
|-------------|-------------------------------|
| `measure`    | Title background, Measure appearance, SQL |
| `chart`      | Title background, Graph, Axes, Legend & Series, SQL |

When adding a new kind, update this component (and the supporting folders in `components/Card/Settings/Sections` or `Inputs`) so that the UI clearly exposes only the relevant controls.

You can quickly see that mapping in `components/Card/Settings/settingsConfig.ts`, which exports `CARD_SETTINGS_LAYOUT` and `CARD_SETTINGS_LABELS` used by `CardSettings.tsx`. The “Legend & Series” section now exposes a “Series key column” input; when you specify the column name that identifies each series, the chart renderer automatically pivots the SQL result so each value becomes its own line, without you needing to rewrite the query.

### Running & linting
```bash
npm install
npm run lint
npm run dev
```

Lint currently flags a handful of pre-existing warnings (hook dependency issues in `page.tsx`, `CardContainer`, `CardView`, `CardSettings`, and some unused imports in settings sections). No new errors were introduced by the recent refactor.
