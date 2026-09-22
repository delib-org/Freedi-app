# Indicators

An **indicator** is one tile on a dashboard: a KPI number, a chart, or an
honest "nothing yet". Each one is a small pure object — an `id`, a `scope`,
a grid-size hint, the i18n keys it reads, and a `build(ctx, labels)` that
turns a context into an `IndicatorOutput`. The dashboards in Agora (teacher
console) and Studio (supervisor views) do not know which indicators exist;
they call `resolveIndicators(scope, prefs)` and render whatever comes back.

```ts
import { resolveIndicators, layoutChart } from '@freedi/shared-charts';

for (const ind of resolveIndicators('class', { hide: ['class.pointsDistribution'] })) {
  const out = ind.build(ctx, { t, locale });
  if (out.type === 'chart') render(layoutChart(out.spec, { dir, locale }));
}
```

## Scopes and contexts

| scope     | context type              | registry             |
|-----------|---------------------------|----------------------|
| `class`   | `ClassIndicatorContext`   | `CLASS_INDICATORS`   |
| `student` | `StudentIndicatorContext` | `STUDENT_INDICATORS` |
| `teacher` | `TeacherIndicatorContext` | `TEACHER_INDICATORS` |
| `school`  | `SchoolIndicatorContext`  | `SCHOOL_INDICATORS`  |
| `system`  | `SystemIndicatorContext`  | `SYSTEM_INDICATORS`  |

Contexts are defined in `contexts.ts`. They wrap the shared-types aggregate
docs (`AgoraClassAggregate`, `AgoraStudentAggregate`, `AgoraOutcomeTally`)
plus small structural series (`WeekPoint`, `DayPoint`, `UsageDayPoint`) so a
callable's response or a test fixture can satisfy them directly.

## Adding an indicator — three steps

1. **Write the build function** in the scope's file (`class.ts`, `teacher.ts`, …):

   ```ts
   const revisionsPerLesson: TeacherIndicator = {
     id: 'teacher.revisionsPerLesson',      // stable; never rename once shipped
     scope: 'teacher',
     size: 'md',                             // sm = KPI tile, md = half row, lg = full row
     labelKeys: [
       'indicator.teacher.revisionsPerLesson',   // the title (always `indicator.<id>`)
       'indicator.series.revisions',             // any legend / category label it uses
       'indicator.empty.noLessonsYet',           // the empty reason it may return
     ],
     build: (ctx, labels) => {
       if (ctx.lessonsByWeek.length === 0) return { type: 'empty', reasonKey: 'noLessonsYet' };

       return { type: 'chart', spec: { kind: 'bars', /* … */ } };
     },
   };
   ```

   Rules: return `{ type: 'empty' }` rather than a chart of zeros; never
   throw on an empty context; put colours in `slot` numbers (1–6), never in
   hex; format nothing yourself — the chart layer formats keys and values
   with the viewer's locale.

2. **Add it to the scope's array** (`TEACHER_INDICATORS = [...]`) at the
   position it should appear by default.

3. **Add the i18n keys** it lists in `labelKeys`:
   - Agora: `apps/agora/src/lib/i18n.ts` (every language block)
   - Studio: map the key to an English sentence in `apps/studio/src/i18n/indicatorEnglish.ts`, then translate that sentence in all seven `packages/shared-i18n/src/languages/*.json` dictionaries

   `labelKeysFor('teacher')` returns the full set for a scope, which is
   what the dictionary audit test compares against.

Then add a case to `src/__tests__/indicators.test.ts`: it must build
without throwing on the empty fixture and produce the expected output type
on the small fixture.

## Hiding and reordering

`resolveIndicators(scope, { hide, order })` takes ids. An app can read those
lists from a settings doc so a school can hide `class.pointsDistribution` or
put `class.participation` first without a code change. Unknown ids are
ignored; ids missing from `order` keep their registry order after the
listed ones.

## Output types

- `stat` — a KPI: `value` (number or preformatted string), optional `unit`
  and `hint`.
- `chart` — a `ChartSpec` for `layoutChart`, optional `height`, `legend`
  (show the legend chips) and `hint` (a caption line).
- `empty` — `reasonKey` is the suffix of `indicator.empty.<reasonKey>`.

Current empty reasons: `noScoredLessons`, `noLessonsYet`, `noMembers`,
`noPointsYet`, `noGamesYet`, `noActivityYet`, `noClasses`, `noScoreYet`.
