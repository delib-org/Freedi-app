# Main app: Other ideas (the leftover theme group) — IA spec

Status: approved by Tal (see §9 decisions)
Date: 2026-10-24
Supersedes: the "Ungrouped" block in ClusterBoard; `filteredOut.byReason.unassigned` in the results export

## 0. What the code does today (findings)
- **The Groups board already has a leftovers block.** `src/view/pages/statement/components/map/ClusterMap/ClusterBoard.tsx` calls it "Ungrouped" (HE "לא מקובץ", id `__ungrouped__`). It holds only raw options. A synthesis in no theme gets its own top-level container, so the board breaks the atom contract today.
- **The Themes & synthesis view has no leftovers at all.** `AgreementHub.tsx` (view `themes`) lists every cluster, themes and syntheses, as flat cards. A synthesis nested in a theme is shown twice.
- **The tree view does not group by theme.** Themes are sibling option nodes, and the "Grouped" filter chip shows only clusters, so atoms disappear under it.
- **The Solutions list never shows themes** (`SuggestionCards` forces `cluster: false`): out of scope.
- **The topic-grouped export (`scripts/exportQuestionResults.ts`) puts unthemed options in `filteredOut.byReason.unassigned`.** With zero themes it filters out every option. `src/utils/exportUtils.ts` is a flat per-statement export with no grouping.
- The existing i18n key "Other" is already used for other meanings (HE "אחר"), so this concept gets its own key.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Participant | See every idea, including those that fit no theme, without feeling they were rejected | Wording that implies failure ("unassigned", "rejected", "not grouped") |
| Admin / facilitator | Know which ideas no theme holds, and file one by hand when it clearly fits | A synthesis's members counted again beside the synthesis |
| Export reader (researcher, client) | Every visible idea in exactly one bucket | Unthemed ideas counted as "filtered out" |

## 2. Object model
- **Theme**: a Statement, `isCluster: true`, `derivedByPipeline: 'topic-cluster'`, a sibling of options under the question. Members are listed in `integratedOptions` (option ids or synthesis ids).
- **Synthesis**: a Statement, `isCluster: true`, `derivedByPipeline: 'synthesis'`. Its members are the original options.
- **Atom** (internal word; the UI says "idea"): a visible synthesis, or a visible option that is in no synthesis. A synthesis's members are never atoms.
- **Other ideas** (new): a derived group, not a Statement doc, not in any collection or vector index. It holds the atoms that no visible theme holds. At most one per question.
- **When an atom is "in a theme"** — exactly the rule the surface uses to nest it, so an atom shows in exactly one place:
  - An option counts if a visible (`!hide`) theme lists its id.
  - A synthesis counts if a visible theme lists its id, or (legacy data) if a visible theme lists any of its members. Same `synthToTopic` rule as `createViewLayersDataSelector`.
  - **One shared pure function feeds every surface and the export** (with unit tests).
- **Lifecycle**: `absent` (zero visible themes, or zero leftover atoms) / `present` (≥1 visible theme and ≥1 leftover atom). An atom leaves Other when the server re-file or an admin files it into a theme; returns when its theme is hidden or deleted.

## 3. Labels
| Concept | EN label | HE label | i18n key | Code type / id | Synonyms to retire |
|---|---|---|---|---|---|
| The leftover group | Other ideas | רעיונות אחרים | `Other ideas` | `OtherIdeasGroup`, `OTHER_IDEAS_ID = '__other_ideas__'`, export `topicId: 'other-ideas'` | "Ungrouped" / "לא מקובץ", `UNGROUPED_ID`, `unassigned` (export) |
| Explainer (same for everyone) | Ideas that stand on their own. | רעיונות שעומדים בפני עצמם. | same as EN | — | — |
| Delete-theme confirm | Delete this cluster? Its notes will move to Other ideas. | למחוק את האשכול? הפתקים שלו יעברו לרעיונות אחרים. | same as EN | — | "…will move to Ungrouped." |
| Tree footer (Grouped filter) | {n} other ideas are not in a theme | {n} רעיונות אחרים אינם באף אשכול | same as EN | — | — |
| Count | {n} ideas (existing key) | existing | `{n} ideas` | — | — |

- Add every new key to all 7 language files: en, he, ar, de, es, fa, nl (Arabic suggestion "أفكار أخرى").
- Remove `Ungrouped` and the old delete-confirm key only if a grep shows no other use.

## 4. Hierarchy (same for participants and admins; admins differ only in board drag)
```
0 Question (/statement/:id)
1   Themes & synthesis (?tab=themes)
2     Theme 1 … Theme N (by consensus, as today)
2     Other ideas (last, always; only if present)
3       atom cards (synthesis cards keep their "original proposals" drawer)
1   Groups board (ClusterBoard)
2     theme containers …
2     Other ideas container (last; grey, outside the palette as Ungrouped is today)
1   Tree view: no Other node (Other is not a Statement)
```

## 5. Navigation
- Other ideas is the last section/container on the two theme surfaces. No route; optional in-page anchor `#other-ideas`.
- Each atom card opens the idea exactly like cards inside themes.
- Tree, Grouped filter: closing line "{n} other ideas are not in a theme" when n > 0; tapping it switches the filter to All.
- Admin only: on the Groups board, dragging an atom from Other into a theme uses the existing manage permission. Deleting a theme sends its notes to Other ideas.

## 6. Task flows
- Participant: Themes & synthesis → scroll to Other ideas → tap the idea. The board's "includes yours" pill also applies to Other.
- Admin: Groups board → Other ideas → drag atom into a theme.
- Export reader: `topics[]` last block is `other-ideas`; counts add up to total visible atoms.

## 7. Screen inventory (delta only; no new screens or routes)
| Screen | Change | Empty | Loading |
|---|---|---|---|
| Themes & synthesis (AgreementHub view `themes`) | Append Other ideas section after theme cards, with count and explainer | Hidden; with zero themes the existing "No themes or syntheses have been created yet." stays | Held until option set fully loaded (`fullyLoadedScopeSelector`) — never a partial count |
| Groups board (ClusterBoard) | "Ungrouped" → Other ideas. Syntheses in no theme move inside it once ≥1 theme exists. Count = atoms. Folded at detail level "themes" (as today) | Hidden | As today |
| Tree view, Grouped filter | Footer line + switch to All | No footer when n = 0 or zero themes | — |
| Topic-grouped export (`scripts/exportQuestionResults.ts`) | New final `TopicBlock`, see §8 | — | — |
| Flat export (`src/utils/exportUtils.ts`) | New column `themeId` | — | — |

Rules for all surfaces:
- **Zero visible themes**: Other is never rendered and its label never appears; surfaces keep their pre-theme state (board shows cards without the heading, syntheses keep their own containers).
- **One leftover atom**: still shown ("Other ideas · 1 idea").
- **Order inside Other**: same sort as inside themes.
- **Count**: atoms only; a synthesis counts 1, members never added.
- **Cards**: the same atom cards used inside themes, never a reduced card.
- Visual treatment must keep Other equal in status to themes — never a "reject pile". Design tokens only.
- On the themes view, if Other is long, show the first few atoms + "Show all {n}" (pick a sensible cut-off, as a named constant).

## 8. Exports
- **Topic-grouped export** (`ResultsExport` in shared-types + the export script): add a final `TopicBlock` with `topicId: 'other-ideas'`, `topicTitle: 'Other ideas'`, new field `isOtherIdeas: true`. Same inclusion rules as theme blocks. `summary.topicCount` excludes it. Remove `filteredOut.byReason.unassigned`, bump `RESULTS_EXPORT_SCHEMA_VERSION`. **With zero themes, still emit the block when atoms exist** (`topicCount: 0`) — the export never drops ideas.
- **Flat export** (`exportUtils.ts`, CSV/JSON): per-row column `themeId`, documented in `PROPERTY_DOCUMENTATION`. Value: theme statementId for a themed atom, `other-ideas` for an atom in Other, empty for theme rows, synthesis members, and every row when zero themes exist.
- Update `plans/topic-grouped-results-export.md` §1/§2 to describe the Other block.

## 9. Decisions (Tal, 2026-10-24)
- Other is shown to everyone. Derived on read. Last, always. Hidden when empty or when there are zero themes.
- Q1 export with zero themes: emit the `other-ideas` block. Q2 one explainer for everyone: "Ideas that stand on their own." (no admin-only text) Q3 mind map: not now. Q4 theme/cluster synonym audit: separate, not this lane. Q5 HE label: "רעיונות אחרים" (Tal's choice).
- Known existing defect, fix in this lane if cheap: AgreementHub themes view shows a synthesis twice (own card and inside its theme) — apply the atom rule so each atom appears once.
- Out of scope: MC, Join, mind map, Solutions list.
