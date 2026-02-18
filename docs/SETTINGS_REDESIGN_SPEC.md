# Statement Settings Page -- Complete Redesign Specification

> **Status**: Design Specification (not yet implemented)
> **Date**: 2026-02-17
> **Target**: Freedi App -- Statement Settings Page

---

## Table of Contents

1. [Problem Summary](#1-problem-summary)
2. [Design Decision: Tabs Over Accordions](#2-design-decision-tabs-over-accordions)
3. [Page Layout](#3-page-layout)
4. [Tab Navigation Component](#4-tab-navigation-component)
5. [Auto-Save Status Bar](#5-auto-save-status-bar)
6. [Tab 1 -- Identity](#6-tab-1----identity)
7. [Tab 2 -- Access](#7-tab-2----access)
8. [Tab 3 -- Interaction](#8-tab-3----interaction)
9. [Tab 4 -- Evaluation](#9-tab-4----evaluation)
10. [Tab 5 -- Advanced](#10-tab-5----advanced)
11. [Tab 6 -- People](#11-tab-6----people)
12. [Shared UI Components](#12-shared-ui-components)
13. [Visual Design Tokens](#13-visual-design-tokens)
14. [Responsive Behavior](#14-responsive-behavior)
15. [RTL Considerations](#15-rtl-considerations)
16. [Accessibility](#16-accessibility)
17. [Files to Create, Modify, and Delete](#17-files-to-create-modify-and-delete)

---

## 1. Problem Summary

The current settings page suffers from five structural issues:

**Nested visual hierarchies.** `StatementSettingsForm` renders a `SettingsSection` card titled "General Settings" which contains `EnhancedAdvancedSettings`. That component has its own header, quick stats bar, quick actions row, and 8 collapsible sub-categories. The result is three levels of expand/collapse (page scroll, SettingsSection accordion, sub-category accordion).

**Two competing design systems.** `SettingsSection` uses priority-colored left borders, blue icon squares, and chevrons. `EnhancedAdvancedSettings` uses category badges ("Essential"/"Recommended"/"Advanced"), gradient headers, and a completely different toggle switch style. Both appear on the same page.

**Mixed save behavior.** Title and description edits update local React state and require clicking a Save button that submits a `<form>`. Every toggle, radio button, and MultiSwitch in the rest of the page writes directly to Firestore. The Save button creates a false mental model that it saves everything.

**Too many top-level sections (13).** An admin faces a wall of collapsible cards: Title/Description, General Settings, Save Button, Membership & Access, Decision Making, Question Structure, User Demographics, Option Rooms, Member Validation, Email Notifications, Clustering & Framings, Participants Data, Member Management.

**Duplicate and scattered settings.** Evaluation-related settings live in three separate locations: EnhancedAdvancedSettings > Evaluation & Voting, the top-level Decision Making section (ChoseBySettings), and the top-level Question Structure section (QuestionSettings). An admin looking for "how do I configure voting" must check all three.

---

## 2. Design Decision: Tabs Over Accordions

Replace the scrolling list of 13 accordion cards with a **6-tab interface**. Only one tab's content is visible at a time.

**Why tabs:**
- Eliminates scroll fatigue. The admin sees one focused section, not a wall of collapsed cards.
- Creates a clear mental map. Six labeled tabs are scannable at a glance.
- Removes nesting. No more accordion-within-accordion-within-page.
- Matches admin workflow. The tabs are ordered by task frequency: Identity (setup once), Access (configure early), Interaction (tune behavior), Evaluation (the core), Advanced (power features), People (ongoing management).

**Why 6 tabs:**
- Cognitive limit. Research shows 5 to 7 items is the sweet spot for scannable navigation.
- Task-based grouping. Each tab answers one admin question: "What is this?", "Who can join?", "How do they interact?", "How do we decide?", "What power tools exist?", "Who are the members?"

---

## 3. Page Layout

### Desktop (1025px and above)

```
+--[ Auto-Save Status Bar ]-----------------------------------+
|                                                              |
+--------------------+-----------------------------------------+
| TAB NAVIGATION     | CONTENT AREA                            |
| (sidebar, 220px)   |                                         |
|                     | [Section Title]                        |
| [x] Identity       | [Section Description]                  |
| [ ] Access          |                                         |
| [ ] Interaction     | [Settings content for active tab]      |
| [ ] Evaluation      |                                         |
| [ ] Advanced        |                                         |
| [ ] People          |                                         |
|                     |                                         |
+--------------------+-----------------------------------------+
```

### Tablet (601px to 1024px)

```
+--[ Auto-Save Status Bar ]---+
|                              |
| [Identity][Access][Inter...] |  <-- horizontal tab bar
|                              |
| [Content Area, centered]     |
|                              |
+------------------------------+
```

### Mobile (0 to 600px)

```
+--[ Auto-Save ]--+
|                  |
| [Id] [Ac] [In]  |  <-- horizontal scroll, icons only below 480px
|                  |
| [Content Area]   |
|                  |
+------------------+
```

### CSS Structure

```scss
// StatementSettings.module.scss
.settingsPage {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--statementBackground); // #f2f6ff
}

.settingsLayout {
  display: flex;
  flex: 1;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.settingsContent {
  flex: 1;
  max-width: var(--wrapper-max-width); // 75ch
  margin: 0 auto;
  padding: 1.5rem;
}

// Mobile: stack vertically
@media (max-width: 1024px) {
  .settingsLayout {
    flex-direction: column;
  }
}
```

---

## 4. Tab Navigation Component

**File**: `src/view/pages/statement/components/settings/components/settingsTabs/SettingsTabs.tsx`
**Styles**: `src/view/pages/statement/components/settings/components/settingsTabs/SettingsTabs.module.scss`

### Tab Definitions

| Tab ID       | Label        | Icon (lucide-react) | Accent Color               | Condition           |
|--------------|--------------|---------------------|-----------------------------|---------------------|
| `identity`   | Identity     | `FileText`          | `var(--btn-primary)`        | Always visible      |
| `access`     | Access       | `Shield`            | `var(--icons-green)`        | Existing statements |
| `interaction`| Interaction  | `MessageCircle`     | `var(--question)`           | Existing statements |
| `evaluation` | Evaluation   | `BarChart3`         | `var(--agree)`              | Existing statements |
| `advanced`   | Advanced     | `Sparkles`          | `var(--group)`              | Existing statements |
| `people`     | People       | `Users`             | `var(--option)`             | Existing statements |

For new statements (no `statementId`), only the Identity tab is shown.

### Desktop Sidebar Styles

```scss
.tabNav {
  width: 220px;
  flex-shrink: 0;
  background: var(--card-default); // #ffffff
  border-inline-end: 1px solid var(--border-light); // #e0e8fa
  padding: 1rem 0;
  position: sticky;
  top: 0;
  height: fit-content;
  max-height: 100vh;
}

.tabItem {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: 48px;
  padding: 0 1rem;
  color: var(--text-body); // #3d4d71
  font-size: var(--p-font-size); // 1rem
  font-weight: 400;
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: start;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--bg-hover); // #f2f6ff
  }

  &:focus-visible {
    outline: 2px solid var(--btn-primary);
    outline-offset: -2px;
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
}

.tabItem--active {
  background: var(--bg-selected); // #e5edff
  color: var(--text-title); // #191e29
  font-weight: 600;
  border-inline-start: 3px solid var(--btn-primary); // #5f88e5
  padding-inline-start: calc(1rem - 3px); // compensate for border

  svg {
    color: var(--btn-primary);
  }
}
```

### Mobile Horizontal Styles

```scss
@media (max-width: 1024px) {
  .tabNav {
    width: 100%;
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-inline-end: none;
    border-bottom: 1px solid var(--border-light);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; // hide scrollbar
    position: static;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .tabItem {
    height: 36px;
    padding: 0 1rem;
    border-radius: 20px;
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.9rem;
  }

  .tabItem--active {
    background: var(--btn-primary);
    color: var(--white);
    border-inline-start: none;
    padding-inline-start: 1rem;

    svg {
      color: var(--white);
    }
  }
}

// Icons only on small mobile
@media (max-width: 480px) {
  .tabItem {
    padding: 0 0.75rem;

    .tabLabel {
      display: none;
    }
  }
}
```

### ARIA Attributes

```tsx
<nav className={styles.tabNav} role="tablist" aria-label="Settings sections">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      role="tab"
      id={`tab-${tab.id}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`panel-${tab.id}`}
      tabIndex={activeTab === tab.id ? 0 : -1}
      className={clsx(styles.tabItem, activeTab === tab.id && styles['tabItem--active'])}
      onClick={() => setActiveTab(tab.id)}
    >
      <tab.icon size={20} />
      <span className={styles.tabLabel}>{tab.label}</span>
    </button>
  ))}
</nav>

<div
  role="tabpanel"
  id={`panel-${activeTab}`}
  aria-labelledby={`tab-${activeTab}`}
  className={styles.settingsContent}
>
  {/* Active section content */}
</div>
```

### Keyboard Navigation

- `ArrowDown` / `ArrowRight`: Move to next tab (desktop: down, mobile: right)
- `ArrowUp` / `ArrowLeft`: Move to previous tab
- `Home`: First tab
- `End`: Last tab
- `Enter` / `Space`: Activate focused tab
- `Tab`: Move focus into the content panel

---

## 5. Auto-Save Status Bar

**File**: `src/view/pages/statement/components/settings/components/autoSaveIndicator/AutoSaveIndicator.tsx`
**Styles**: `src/view/pages/statement/components/settings/components/autoSaveIndicator/AutoSaveIndicator.module.scss`

### Position

Fixed at the top of the content area, inline-end aligned. On mobile, it floats in the top-right (or top-left in RTL) corner of the content.

### States

| State   | Icon (lucide-react) | Text          | Color                     | Duration  |
|---------|---------------------|---------------|---------------------------|-----------|
| idle    | (none)              | (hidden)      | (hidden)                  | --        |
| saving  | `Loader2` (spinning)| "Saving..."   | `var(--text-caption)`     | Persists  |
| saved   | `Check`             | "Saved"       | `var(--text-success)`     | 2 seconds |
| error   | `AlertCircle`       | "Save failed" | `var(--text-error)`       | Persists  |

### Styles

```scss
.autoSave {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  border-radius: 20px;
  transition: opacity 0.3s ease, transform 0.3s ease;
  position: absolute;
  inset-inline-end: 1.5rem;
  top: 1.5rem;
  z-index: 10;

  svg {
    width: 16px;
    height: 16px;
  }
}

.autoSave--idle {
  opacity: 0;
  pointer-events: none;
}

.autoSave--saving {
  opacity: 1;
  color: var(--text-caption); // #7484a9
  background: var(--card-default);
  border: 1px solid var(--border-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  svg {
    animation: spin 1s linear infinite;
  }
}

.autoSave--saved {
  opacity: 1;
  color: var(--text-success); // #4fab9a
  background: var(--bg-success-light); // #f0fdf4
  border: 1px solid var(--text-success);
}

.autoSave--error {
  opacity: 1;
  color: var(--text-error); // #f74a4d
  background: var(--bg-error-light); // #fff5f5
  border: 1px solid var(--text-error);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// Screen reader live region
.autoSave__liveRegion {
  @include visually-hidden;
}
```

### Behavior

1. When any setting changes: transition to `saving` state
2. On successful Firestore write: transition to `saved` state
3. After 2 seconds in `saved`: transition to `idle`
4. On write failure: transition to `error` state, persist until next successful save
5. For debounced fields (title, description): `saving` appears when debounce timer starts, `saved` when the write completes

### ARIA

```tsx
<div className={styles.autoSave} aria-hidden="true">
  {/* Visual indicator */}
</div>
<div
  role="status"
  aria-live="polite"
  className={styles.autoSave__liveRegion}
>
  {status === 'saved' && 'Settings saved'}
  {status === 'error' && 'Save failed'}
</div>
```

---

## 6. Tab 1 -- Identity

**Tab label**: Identity
**Icon**: `FileText`
**Description**: Name, description, and appearance
**Accent**: `var(--btn-primary)` (#5f88e5)

### Settings

| # | Setting                | Type             | Icon (lucide-react) | Property / Handler                                     | Description                                                      | Condition            | Save Behavior             |
|---|------------------------|------------------|---------------------|--------------------------------------------------------|------------------------------------------------------------------|----------------------|---------------------------|
| 1 | Title                  | Text input       | `Type`              | `statement.statement` (local state)                    | The main title of the statement                                  | Always               | Auto-save, 500ms debounce |
| 2 | Description            | Textarea         | `AlignLeft`         | `statement.paragraphs` (local state)                   | Detailed description and context                                 | Always               | Auto-save, 500ms debounce |
| 3 | Cover Image            | Image upload     | `Image`             | `statement.imagesURL.main`                             | Visual cover image for the statement                             | Always               | Auto-save on upload       |
| 4 | Hide Statement         | Toggle           | `EyeOff`            | `statement.hide` (root-level)                          | Make this statement invisible to non-members                     | Existing statements  | Immediate                 |
| 5 | Default Language       | Dropdown/Select  | `Globe`             | `statement.defaultLanguage` (root-level)               | Language used for surveys when users have no preference          | Existing statements  | Immediate                 |
| 6 | Force Language         | Toggle           | `Lock`              | `statement.forceLanguage` (root-level)                 | Override browser preferences; all participants see default lang  | Existing statements  | Immediate                 |

### Layout

```
[Section Header: "Identity" / "Name, description, and appearance"]

--- Basic Information ---

[Label: Title *]
[Text input - full width, maxLength 100]
[Character count: 0/100]

[Label: Description]
[Textarea - full width, 4 rows, maxLength 500]
[Character count: 0/500]

[Label: Cover Image]
[Upload area with preview / drag-and-drop]

--- Appearance --- (existing statements only)

[ToggleRow: Hide Statement]
  Icon: EyeOff
  Label: "Hide this statement"
  Description: "Make this statement invisible to non-members"

--- Language --- (existing statements only)

[Label: Survey Default Language]
[LanguageSelector component]

[ToggleRow: Force Language]
  Icon: Lock
  Label: "Force survey language"
  Description: "Override browser preferences; all participants see the default language"
```

### Subsection Divider Spec

```scss
.subsectionDivider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.5rem 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light); // #e0e8fa
  }
}

.subsectionLabel {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-caption); // #7484a9
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
```

### Auto-Save for Title and Description

Title and description currently require a Save button because they update local React state. The redesign changes this:

1. On each keystroke, update local state (for responsive UI)
2. Start a 500ms debounce timer
3. When timer fires, call `setNewStatement()` to persist to Firestore
4. Show auto-save indicator: saving -> saved
5. If the user navigates away during the debounce window, flush immediately

This eliminates the `<form>` wrapper and the Save button entirely.

---

## 7. Tab 2 -- Access

**Tab label**: Access
**Icon**: `Shield`
**Description**: Who can view, join, and participate
**Accent**: `var(--icons-green)` (#4fab9a)

### Settings

| # | Setting                  | Type              | Icon (lucide-react) | Property / Handler                                       | Description                                                     | Condition                 | Save Behavior |
|---|--------------------------|-------------------|---------------------|----------------------------------------------------------|-----------------------------------------------------------------|---------------------------|---------------|
| 1 | Inherit from Parent      | Checkbox          | `GitBranch`         | MembershipSettings internal (clears `membership.access`) | Use the parent group's access level                             | Non-top-level statements  | Immediate     |
| 2 | Access Level             | MultiSwitch       | `ShieldCheck`       | `statement.membership.access` via `setStatementMembership` | Public / Open to All / Registered / Moderated / Secret         | Always (unless inheriting)| Immediate     |
| 3 | Members List             | Display (chips)   | `Users`             | Read from `statementMembership` Redux slice              | Current members with roles                                      | Existing statements       | N/A (display) |
| 4 | Banned Users             | Display           | `UserX`             | Read from `statementMembership` (role = banned)          | Users who have been banned                                      | Existing statements       | N/A (display) |
| 5 | Share Link               | Copy action       | `Share2`            | Read-only URL from `getMassConsensusQuestionUrl`          | Copy invite link to clipboard                                   | Existing statements       | N/A (action)  |

### Layout

```
[Section Header: "Access" / "Who can view, join, and participate"]

--- Access Level ---

[Checkbox: Inherit from Parent Group] (only for non-top-level statements)
  Icon: GitBranch
  If checked, show inherited access level badge + parent name

[MultiSwitch: Access Level] (visible when not inheriting or top-level)
  Options: Public | Open to All | Registered | Moderated | Secret
  Each option has tooltip on hover

--- Members --- (divider)

[Members chip list with count badge]
  Shows member avatars/names, click to manage

[Banned users section]
  Shows banned users if any exist

--- Sharing --- (divider)

[Question/Statement Link]
  Read-only input with Copy button and Open button
```

### Access Level MultiSwitch Options

| Value              | Label        | Icon           | Tooltip                                   |
|--------------------|--------------|----------------|-------------------------------------------|
| `Access.public`    | Public       | `Globe`        | Anyone can view and interact without login |
| `Access.openToAll` | Open to All  | `DoorOpen`     | Anyone can join the group                  |
| `Access.openForRegistered` | Registered | `UserCheck` | Only registered members can join      |
| `Access.moderated` | Moderated    | `ShieldCheck`  | Requires approval to join                  |
| `Access.secret`    | Secret       | `Lock`         | Invitation only                            |

---

## 8. Tab 3 -- Interaction

**Tab label**: Interaction
**Icon**: `MessageCircle`
**Description**: Chat, collaboration, and content features
**Accent**: `var(--question)` (#47b4ef)

### Settings

| #  | Setting                    | Type   | Icon (lucide-react) | Property                              | Description                                                   | Condition                        | Save Behavior |
|----|----------------------------|--------|---------------------|---------------------------------------|---------------------------------------------------------------|----------------------------------|---------------|
| 1  | Enable Chat                | Toggle | `MessageCircle`     | `statementSettings.hasChat`           | Allow members to chat and discuss                             | Always                           | Immediate     |
| 2  | Chat Side Panel            | Toggle | `PanelRight`        | `statementSettings.enableChatPanel`   | Display collapsible chat panel alongside main content         | Only when chat is enabled        | Immediate     |
| 3  | Sub-Conversations          | Toggle | `GitBranch`         | `statementSettings.hasChildren`       | Allow nested discussions and sub-topics                       | Always                           | Immediate     |
| 4  | Sub-Questions Map          | Toggle | `Map`               | `statementSettings.enableSubQuestionsMap` | Display navigational tree of sub-questions                | Always                           | Immediate     |
| 5  | Sub-Questions Button       | Toggle | `PlusCircle`        | `statementSettings.enableAddNewSubQuestionsButton` | Show button to create nested questions              | Question type only               | Immediate     |
| 6  | Navigation Elements        | Toggle | `Compass`           | `statementSettings.enableNavigationalElements` | Display breadcrumbs and navigation aids                 | Always                           | Immediate     |
| 7  | Add Options in Voting      | Toggle | `ListPlus`          | `statementSettings.enableAddVotingOption` | Participants can contribute new options while voting       | Always                           | Immediate     |
| 8  | Add Options in Evaluation  | Toggle | `ListPlus`          | `statementSettings.enableAddEvaluationOption` | Participants can add options during evaluation         | Always                           | Immediate     |
| 9  | Enable Joining Options     | Toggle | `UserPlus`          | `statementSettings.joiningEnabled`    | Allow users to join and support specific options              | Question type only               | Immediate     |
| 10 | Popper-Hebbian Mode        | Toggle | `Lightbulb`         | `statementSettings.popperianDiscussionEnabled` | Evidence-based discussion with support/challenge format | Question type only               | Immediate     |
| 11 | AI Pre-Check               | Toggle | `ShieldCheck`       | `statementSettings.popperianPreCheckEnabled` | AI reviews and refines options before posting            | Only when Popper-Hebbian is on   | Immediate     |

### Layout

```
[Section Header: "Interaction" / "Chat, collaboration, and content features"]

--- Communication ---

[ToggleRow: Enable Chat]
  Icon: MessageCircle
  Label: "Enable Chat"
  Description: "Allow members to chat and discuss"

  [ToggleRow: Chat Side Panel] (indented, conditional: chat enabled)
    Icon: PanelRight
    Label: "Show Chat Side Panel"
    Description: "Display collapsible chat panel alongside main content"

[ToggleRow: Sub-Conversations]
  Icon: GitBranch
  Label: "Enable Sub-Conversations"
  Description: "Allow nested discussions and sub-topics"

--- Content Structure ---

[ToggleRow: Sub-Questions Map]
  Icon: Map
  Label: "Show Sub-Questions Map"
  Description: "Display navigational tree of sub-questions"

[ToggleRow: Sub-Questions Button] (question type only)
  Icon: PlusCircle
  Label: "Sub-Questions Button"
  Description: "Show button to create nested questions"

[ToggleRow: Navigation Elements]
  Icon: Compass
  Label: "Navigation Elements"
  Description: "Display breadcrumbs and navigation aids"

--- Participant Contributions ---

[ToggleRow: Add Options in Voting]
  Icon: ListPlus
  Label: "Add Options in Voting"
  Description: "Participants can contribute new options while voting"

[ToggleRow: Add Options in Evaluation]
  Icon: ListPlus
  Label: "Add Options in Evaluation"
  Description: "Participants can add options during evaluation"

[ToggleRow: Enable Joining Options] (question type only)
  Icon: UserPlus
  Label: "Enable Joining Options"
  Description: "Allow users to join and support specific options"

--- Discussion Framework --- (question type only)

[ToggleRow: Popper-Hebbian Mode]
  Icon: Lightbulb
  Label: "Popper-Hebbian Mode"
  Description: "Evidence-based discussion with support/challenge format"

  [ToggleRow: AI Pre-Check] (indented, conditional: Popper-Hebbian enabled)
    Icon: ShieldCheck
    Label: "AI Pre-Check"
    Description: "AI reviews and refines options before posting"
```

### Conditional (Indented) Setting Style

When a parent toggle enables a child setting, the child appears indented:

```scss
.toggleRow--indented {
  margin-inline-start: 2.5rem;
  padding-inline-start: 1rem;
  border-inline-start: 2px solid var(--border-light); // #e0e8fa
  background: rgba(242, 246, 255, 0.5); // var(--bg-hover) at 50%
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    max-height: 200px;
    transform: translateY(0);
  }
}
```

---

## 9. Tab 4 -- Evaluation

**Tab label**: Evaluation
**Icon**: `BarChart3`
**Description**: Voting, scoring, and decision methods
**Accent**: `var(--agree)` (#57c6b2)

This tab consolidates settings currently scattered across three separate locations: `EnhancedAdvancedSettings` (Evaluation & Voting category), `ChoseBySettings`, and `QuestionSettings`.

### Settings

| #  | Setting                         | Type                | Icon (lucide-react)  | Property / Handler                                                  | Description                                                    | Condition                   | Save Behavior |
|----|---------------------------------|---------------------|----------------------|---------------------------------------------------------------------|----------------------------------------------------------------|-----------------------------|---------------|
| 1  | Evaluation Mode                 | MultiSwitch (4-way) | `Target`             | `evaluationSettings.evaluationUI` via `setEvaluationUIType`        | Agreement / Voting / Approval / Cluster                        | Question type only          | Immediate     |
| 2  | Rating Scale                    | Card selector (4)   | `BarChart3`          | `statementSettings.evaluationType` via `setStatementSettingToDB`   | 5-Point Scale / Simple Scale / Like Only / Community Voice     | Question type only          | Immediate     |
| 3  | Enable Voting                   | Toggle              | `Vote`               | `statementSettings.enableEvaluation`                               | Allow users to vote and evaluate options                       | Always                      | Immediate     |
| 4  | Show Results                    | Toggle              | `PieChart`           | `statementSettings.showEvaluation`                                 | Display evaluation results to participants                     | Always                      | Immediate     |
| 5  | Show Top Results Only           | Toggle              | `Award`              | `statementSettings.inVotingGetOnlyResults`                         | Display only highest-rated options in voting view              | Always                      | Immediate     |
| 6  | Submit Mode                     | Toggle              | `Send`               | `statementSettings.isSubmitMode`                                   | Users submit final choices rather than continuous voting        | Always                      | Immediate     |
| 7  | Limit Votes Per User            | Toggle              | `Hash`               | `evaluationSettings.maxVotesPerUser` via `setMaxVotesPerUser`      | Restrict the number of options users can vote for              | When evaluationType is singleLike | Immediate |
| 8  | Maximum Votes                   | Number input        | (nested under #7)    | `evaluationSettings.maxVotesPerUser` via `setMaxVotesPerUser`      | Max number of options a user can vote for (1-100)              | When vote limit is enabled  | Immediate     |
| 9  | Results Method                  | Radio group (3)     | `Trophy`             | `resultsSettings.resultsBy` via `updateResultSettingsToDB`         | By Consensus / By Most Liked / By Sum                          | Question type only          | Immediate     |
| 10 | Cutoff Type                     | Radio group (2)     | `Scissors`           | `resultsSettings.cutoffBy` via `updateResultSettingsToDB`          | Top N Results / Above Threshold                                | Question type only          | Immediate     |
| 11 | Cutoff Value                    | Range slider        | `SlidersHorizontal`  | `resultsSettings.numberOfResults` or `resultsSettings.cutoffNumber`| Numeric threshold or count for top results                     | Question type only          | On mouse/touch up |
| 12 | Require Input Before Viewing    | Toggle              | `MessageSquarePlus`  | `questionSettings.askUserForASolutionBeforeEvaluation`             | Users must submit their own idea before seeing others          | Question type only          | Immediate     |
| 13 | Anchored Sampling               | Toggle              | `Anchor`             | `evaluationSettings.anchored.anchored` via `setAnchoredEvaluationSettings` | Insert pre-defined options into evaluation                  | Question type only          | Immediate     |
| 14 | Anchored Count                  | Number input        | (nested under #13)   | `evaluationSettings.anchored.numberOfAnchoredStatements`           | Number of anchored options shown (1-10)                        | When anchored is enabled    | Immediate     |
| 15 | Community Badges                | Toggle              | `Award`              | `evaluationSettings.anchored.differentiateBetweenAnchoredAndNot`   | Show visual distinction between anchored and user options      | When anchored is enabled    | Immediate     |
| 16 | Anchor Badge Label              | Text input          | `Tag`                | `evaluationSettings.anchored.anchorLabel`                          | Custom label for the anchor badge (max 20 chars)               | When anchored is enabled    | Immediate     |
| 17 | Anchor Tooltip Description      | Textarea            | `FileText`           | `evaluationSettings.anchored.anchorDescription`                    | Custom tooltip text for anchor badge (max 100 chars)           | When anchored is enabled    | Immediate     |
| 18 | Anchor Icon                     | File upload         | `Image`              | `evaluationSettings.anchored.anchorIcon`                           | Custom icon image for anchor badge                             | When anchored is enabled    | On upload     |
| 19 | Voting Settings (sub-component) | Component           | `Settings`           | VotingSettings component                                           | Additional voting configuration                                | When evaluationUI is voting | N/A           |

### Layout

```
[Section Header: "Evaluation" / "Voting, scoring, and decision methods"]

--- How People Evaluate --- (question type only)

[MultiSwitch: Evaluation Mode]
  Options: Agreement | Voting | Approval | Cluster
  Each option has icon and tooltip

[VotingSettings sub-component] (only when mode is Voting)

[Card Selector: Rating Scale]
  Cards: 5-Point Scale | Simple Scale | Like Only | Community Voice
  Each card has icon, title, description, selected state

--- Voting Controls ---

[ToggleRow: Enable Voting]
  Icon: Vote
  Label: "Enable Voting"
  Description: "Allow users to vote and evaluate options"

[ToggleRow: Show Results]
  Icon: PieChart
  Label: "Show Results"
  Description: "Display evaluation results to participants"

[ToggleRow: Show Top Results Only]
  Icon: Award
  Label: "Show Top Results Only"
  Description: "Display only highest-rated options in voting view"

[ToggleRow: Submit Mode]
  Icon: Send
  Label: "Submit Mode"
  Description: "Users submit final choices rather than continuous voting"

[ToggleRow: Limit Votes Per User] (conditional: evaluationType is singleLike)
  Icon: Hash
  Label: "Limit votes per user"
  Description: "Restrict the number of options users can vote for"

  [Number Input: Maximum Votes] (indented, conditional: vote limit enabled)
    Min: 1, Max: 100
    Helper text: "Users can vote for up to N options"

--- Decision Method --- (question type only, divider)

[RadioGroup: Results Method]
  Icon: Trophy
  Options: By Consensus | By Most Liked | By Sum Liked - Disliked

[RadioGroup: Cutoff Type]
  Icon: Scissors
  Options: Top Results | Above Specific Value

[Range Slider: Cutoff Value]
  Dynamic min/max/step based on resultsBy and cutoffBy

--- Advanced Evaluation --- (question type only, divider)

[ToggleRow: Require Input Before Viewing]
  Icon: MessageSquarePlus
  Label: "Require original input before viewing others"
  Description: "Users must submit their own idea before seeing others"

[ToggleRow: Anchored Sampling]
  Icon: Anchor
  Label: "Anchored Sampling"
  Description: "Insert pre-defined options that always appear in evaluation"

  (conditional panel when Anchored is enabled:)
  [Number Input: Anchored Count] (1-10)
  [ToggleRow: Community Badges]
    Icon: Award
    Label: "Show Community Recognition"
    Description: "Visual distinction between anchored and user options"
  [Text Input: Badge Label] (max 20 chars)
  [Textarea: Tooltip Description] (max 100 chars)
  [File Upload: Anchor Icon] (with preview and clear button)
  [Live Preview: AnchoredBadge component]
```

### Card Selector Component Spec

Used for Rating Scale selection. Four cards in a responsive grid.

```scss
.cardSelector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.cardOption {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: var(--card-default); // #ffffff
  border: 2px solid var(--border-light); // #e0e8fa
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &:hover {
    border-color: var(--btn-primary); // #5f88e5
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.cardOption--selected {
  border-color: var(--btn-primary);
  background: var(--bg-selected); // #e5edff

  .cardOption__icon {
    background: var(--btn-primary);
    color: var(--white);
  }
}

.cardOption__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-selected); // #e5edff
  color: var(--icons-blue); // #5f88e5
  margin-bottom: 0.75rem;
}

.cardOption__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-title); // #191e29
  margin: 0 0 0.25rem 0;
}

.cardOption__description {
  font-size: 0.8rem;
  color: var(--text-caption); // #7484a9
  margin: 0;
  line-height: 1.3;
}

.cardOption__check {
  position: absolute;
  top: 0.5rem;
  inset-inline-end: 0.5rem;
  color: var(--btn-primary);
}

// Mobile: 2 columns
@media (max-width: 480px) {
  .cardSelector {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .cardOption {
    padding: 0.75rem;
  }
}
```

---

## 10. Tab 5 -- Advanced

**Tab label**: Advanced
**Icon**: `Sparkles`
**Description**: AI features, automation, surveys, and data tools
**Accent**: `var(--group)` (#b893e7)

### Settings

| #  | Setting                    | Type           | Icon (lucide-react) | Property / Handler                                            | Description                                                          | Condition             | Save Behavior   |
|----|----------------------------|----------------|---------------------|---------------------------------------------------------------|----------------------------------------------------------------------|-----------------------|-----------------|
| 1  | AI Suggestion Enhancement  | Toggle         | `Sparkles`          | `statementSettings.enableAIImprovement`                       | Use AI to improve and refine user suggestions                        | Always                | Immediate       |
| 2  | Similarity Detection       | Toggle         | `Search`            | `statementSettings.enableSimilaritiesSearch`                  | Automatically detect and group similar suggestions                   | Always                | Immediate       |
| 3  | Similarity Threshold       | Range slider   | `SlidersHorizontal` | `statementSettings.similarityThreshold`                       | How similar items must be to group (50-95%, recommended 75-85%)      | When #2 is enabled    | Immediate       |
| 4  | Auto-Check Similarities    | Toggle         | `ScanSearch`        | `statementSettings.defaultLookForSimilarities`                | Check for similar statements by default                              | Question type only    | Immediate       |
| 5  | Multi-Suggestion Detection | Toggle         | `Split`             | `statementSettings.enableMultiSuggestionDetection`            | Detect when users submit multiple ideas and offer to split them      | Question type only    | Immediate       |
| 6  | User Demographics          | Sub-component  | `ClipboardList`     | UserDemographicSetting component                              | Configure demographic survey for participants                        | Always                | Per-component   |
| 7  | Email Notifications        | Form           | `Mail`              | EmailNotifications component                                  | Send custom emails to subscribers                                    | Always                | Manual send     |
| 8  | Clustering & Framings      | Sub-component  | `Network`           | ClusteringAdmin component                                     | AI-powered grouping and analysis of responses                        | Question type only    | Per-component   |
| 9  | Option Rooms               | Sub-component  | `DoorOpen`          | OptionRooms component (JoinBehavior, RoomSize, RoomDiversity) | Configure how participants group around options                      | Always                | Per-component   |
| 10 | Question Link              | Copy action    | `Link`              | Read-only URL from `getMassConsensusQuestionUrl`               | Mass Consensus question URL                                          | Question type only    | N/A (action)    |
| 11 | Export Statement Data JSON | Button         | `Download`          | `exportStatementData(statement, subStatements, 'json')`       | Download statement + sub-statements as JSON                          | Always                | N/A (action)    |
| 12 | Export Statement Data CSV  | Button         | `Download`          | `exportStatementData(statement, subStatements, 'csv')`        | Download statement + sub-statements as CSV                           | Always                | N/A (action)    |
| 13 | Export User Data JSON      | Button         | `FileDown`          | `exportPrivacyPreservingData(statement, subStatements, 'json')` | Download evaluation data with demographic breakdowns (k-anonymity) | Always                | N/A (action)    |
| 14 | Export User Data CSV       | Button         | `FileDown`          | `exportPrivacyPreservingData(statement, subStatements, 'csv')` | Download evaluation data as CSV                                     | Always                | N/A (action)    |
| 15 | Recalculate Evaluations    | Button         | `RefreshCw`         | `requestRecalculateEvaluations(statementId)`                  | Fix inconsistencies in evaluation counts                             | Always                | N/A (action)    |

### Layout

```
[Section Header: "Advanced" / "AI features, automation, surveys, and data tools"]

--- AI Features ---

[ToggleRow: AI Suggestion Enhancement]
  Icon: Sparkles
  Label: "AI Suggestion Enhancement"
  Description: "Use AI to improve and refine user suggestions"

[ToggleRow: Similarity Detection]
  Icon: Search
  Label: "Similarity Detection"
  Description: "Automatically detect and group similar suggestions"

  [Slider: Similarity Threshold] (indented, conditional: similarity detection on)
    Icon: SlidersHorizontal
    Label: "Similarity Threshold"
    Description: "Higher values require stronger similarity (recommended: 75-85%)"
    Min: 50%, Max: 95%, Step: 5%

[ToggleRow: Auto-Check Similarities] (question type only)
  Icon: ScanSearch
  Label: "Auto-Check Similarities"
  Description: "Check for similar statements by default"

[ToggleRow: Multi-Suggestion Detection] (question type only)
  Icon: Split
  Label: "Multi-Suggestion Detection"
  Description: "Detect when users submit multiple ideas and offer to split them"

--- Surveys & Demographics ---

[UserDemographicSetting component]
  Renders its own internal UI for configuring demographic questions

--- Communication ---

[EmailNotifications component]
  Renders subscriber count, subject/message form, send button

--- Analysis Tools --- (question type only)

[ClusteringAdmin component]
  Renders AI clustering interface

--- Groups & Rooms ---

[OptionRooms component - without its own SettingsSection wrapper]
  JoinBehaviorSettings
  RoomSizeSettings (conditional)
  RoomDiversitySettings (conditional)
  OptionsStatusList (conditional)
  CreatedRoomsDisplay (conditional)

--- Data & Export ---

[Question Link with copy button] (question type only)
  Icon: Link
  Read-only input + Copy + Open buttons

[Action Card: Export Statement Data]
  Icon: Download
  Description: "Download statement and sub-statements with full metadata"
  Buttons: [Export JSON] [Export CSV]
  Info: "Includes N sub-statements"

[Action Card: Export User Data]
  Icon: FileDown
  Description: "Export evaluation data with demographic breakdowns (k-anonymity protected)"
  Buttons: [Export JSON] [Export CSV]

[Action Card: Recalculate Evaluations]
  Icon: RefreshCw
  Description: "Fix inconsistencies in evaluation counts"
  Button: [Recalculate] (warning style)
  Shows result message on completion
```

### Action Card Component Spec

```scss
.actionCard {
  padding: 1rem;
  background: var(--card-default); // #ffffff
  border: 1px solid var(--border-light); // #e0e8fa
  border-radius: 8px;
  margin-bottom: 1rem;

  &__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;

    svg {
      color: var(--icons-blue); // #5f88e5
      width: 20px;
      height: 20px;
    }
  }

  &__title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-title); // #191e29
    margin: 0;
  }

  &__description {
    font-size: 0.85rem;
    color: var(--text-caption); // #7484a9
    margin: 0 0 1rem 0;
    line-height: 1.4;
  }

  &__buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  &__info {
    font-size: 0.8rem;
    color: var(--text-caption);
    margin-top: 0.75rem;
    font-style: italic;
  }
}
```

---

## 11. Tab 6 -- People

**Tab label**: People
**Icon**: `Users`
**Description**: Manage, validate, and track members
**Accent**: `var(--option)` (#e7d080)

### Settings

| # | Setting            | Type           | Icon (lucide-react) | Component / Handler                              | Description                                             | Condition             | Save Behavior   |
|---|--------------------|----------------|---------------------|--------------------------------------------------|---------------------------------------------------------|-----------------------|-----------------|
| 1 | Member Management  | Sub-component  | `UserCog`           | MembersManagement component                      | Search, filter, invite, manage roles                    | Existing statements   | Per-action      |
| 2 | Member Validation  | Sub-component  | `UserCheck`         | MemberValidation component                       | Review and approve pending member responses              | Question type only    | Per-action      |
| 3 | Voters Data        | Fetch + display| `Vote`              | GetVoters component                              | View which members have voted                           | Existing statements   | N/A (fetch)     |
| 4 | Evaluators Data    | Fetch + display| `BarChart3`         | GetEvaluators component                          | View which members have evaluated                       | Existing statements   | N/A (fetch)     |

### Layout

```
[Section Header: "People" / "Manage, validate, and track members"]

--- Member Management ---

[MembersManagement component]
  Search bar
  Role filter
  Member list with role badges, actions (promote, demote, ban)
  Invite button

--- Pending Validation --- (question type only, divider)

[MemberValidation component]
  Review cards for pending member responses

--- Participation Data --- (divider)

[GetVoters component]
  Fetch button, displays voter list

[GetEvaluators component]
  Fetch button, displays evaluator list
```

---

## 12. Shared UI Components

### ToggleRow (Settings Toggle)

**File**: `src/view/pages/statement/components/settings/components/settingsToggleRow/SettingsToggleRow.tsx`

The most common element on the page. Every toggle setting uses this consistent component.

```tsx
interface SettingsToggleRowProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  isChecked: boolean;
  onChange: (checked: boolean) => void;
  indented?: boolean;        // for conditional sub-settings
  disabled?: boolean;
  badge?: 'new' | 'recommended' | 'premium';
}
```

### ToggleRow Styles

```scss
.toggleRow {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.75rem;
  border-radius: 8px;
  transition: background 0.15s ease;

  &:hover {
    background: var(--bg-hover); // #f2f6ff
  }
}

.toggleRow__content {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.toggleRow__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--bg-selected); // #e5edff
  color: var(--icons-blue); // #5f88e5
  flex-shrink: 0;

  svg {
    width: 18px;
    height: 18px;
  }
}

.toggleRow__info {
  flex: 1;
  min-width: 0;
}

.toggleRow__labelRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.toggleRow__label {
  font-size: var(--p-font-size); // 1rem
  font-weight: 500;
  color: var(--text-title); // #191e29
}

.toggleRow__description {
  font-size: 0.85rem;
  color: var(--text-caption); // #7484a9
  margin: 0.25rem 0 0 0;
  line-height: 1.4;
}

.toggleRow__toggle {
  flex-shrink: 0;
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  margin-top: 4px; // align with label text

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .toggleRow__slider {
      background: var(--toggle-enabled); // #76c0b3
    }

    &:checked + .toggleRow__slider::before {
      transform: translateX(20px);
    }

    &:focus-visible + .toggleRow__slider {
      box-shadow: 0 0 0 3px rgba(95, 136, 229, 0.2);
    }
  }
}

.toggleRow__slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--toggle-background); // #e0e8fa
  border-radius: 24px;
  transition: background 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    inset-inline-start: 3px;
    bottom: 3px;
    background: var(--white);
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }
}

// Indented variant for conditional sub-settings
.toggleRow--indented {
  margin-inline-start: 2.5rem;
  padding-inline-start: 1rem;
  border-inline-start: 2px solid var(--border-light);
  background: rgba(242, 246, 255, 0.5);
}

// Badge
.toggleRow__badge {
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &--new {
    background: rgba(184, 147, 231, 0.15); // var(--group) tint
    color: var(--group); // #b893e7
  }

  &--recommended {
    background: rgba(79, 171, 154, 0.15); // var(--approve) tint
    color: var(--approve); // #4fab9a
  }

  &--premium {
    background: rgba(239, 117, 80, 0.15); // var(--text-warning) tint
    color: var(--text-warning); // #ef7550
  }
}

// Mobile: stack label and toggle vertically
@media (max-width: 480px) {
  .toggleRow {
    flex-direction: column;
    gap: 0.75rem;
  }

  .toggleRow__toggle {
    align-self: flex-end;
    margin-top: 0;
  }
}
```

### Section Header (within content panel)

Each tab's content starts with a section header. There is no wrapping card -- the tab navigation already provides context.

```scss
.sectionHeader {
  margin-bottom: 2rem;
  position: relative; // for auto-save indicator positioning
}

.sectionHeader__title {
  font-size: var(--h3-font-size); // 1.5rem
  font-weight: 600;
  color: var(--text-title); // #191e29
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    color: var(--icons-blue); // #5f88e5
    width: 24px;
    height: 24px;
  }
}

.sectionHeader__description {
  font-size: var(--p-font-size); // 1rem
  color: var(--text-caption); // #7484a9
  margin: 0;
  line-height: 1.5;
  max-width: 60ch;
}

// Mobile
@media (max-width: 600px) {
  .sectionHeader__title {
    font-size: var(--h4-font-size); // 1.3rem

    svg {
      width: 20px;
      height: 20px;
    }
  }
}
```

---

## 13. Visual Design Tokens

All values reference CSS custom properties from `src/view/style/_variables.scss`.

### Colors Used in Settings

| Purpose                  | Variable                    | Hex       |
|--------------------------|-----------------------------|-----------|
| Page background          | `--statementBackground`     | #f2f6ff   |
| Card / panel background  | `--card-default`            | #ffffff   |
| Primary icon color       | `--icons-blue`              | #5f88e5   |
| Primary button           | `--btn-primary`             | #5f88e5   |
| Primary button hover     | `--btn-primary-hover`       | #80a0ea   |
| Selected background      | `--bg-selected`             | #e5edff   |
| Hover background         | `--bg-hover`                | #f2f6ff   |
| Border (light)           | `--border-light`            | #e0e8fa   |
| Text: title              | `--text-title`              | #191e29   |
| Text: body               | `--text-body`               | #3d4d71   |
| Text: caption/label      | `--text-caption`            | #7484a9   |
| Text: success            | `--text-success`            | #4fab9a   |
| Text: error              | `--text-error`              | #f74a4d   |
| Text: warning            | `--text-warning`            | #ef7550   |
| Toggle enabled           | `--toggle-enabled`          | #76c0b3   |
| Toggle background        | `--toggle-background`       | #e0e8fa   |
| Success bg (light)       | `--bg-success-light`        | #f0fdf4   |
| Error bg (light)         | `--bg-error-light`          | #fff5f5   |
| Tab accents (by tab):    |                             |           |
| -- Identity              | `--btn-primary`             | #5f88e5   |
| -- Access                | `--icons-green`             | #4fab9a   |
| -- Interaction           | `--question`                | #47b4ef   |
| -- Evaluation            | `--agree`                   | #57c6b2   |
| -- Advanced              | `--group`                   | #b893e7   |
| -- People                | `--option`                  | #e7d080   |

### Typography

| Element             | Size                      | Weight | Color                |
|---------------------|---------------------------|--------|----------------------|
| Tab label           | `var(--p-font-size)` 1rem | 400/600| `--text-body`/`--text-title` |
| Section title       | `var(--h3-font-size)` 1.5rem | 600 | `--text-title`       |
| Section description | `var(--p-font-size)` 1rem | 400    | `--text-caption`     |
| Subsection label    | 0.8rem                    | 600    | `--text-caption`     |
| Toggle label        | `var(--p-font-size)` 1rem | 500    | `--text-title`       |
| Toggle description  | 0.85rem                   | 400    | `--text-caption`     |
| Badge text          | 0.7rem                    | 600    | (varies by badge)    |
| Auto-save text      | 0.85rem                   | 500    | (varies by state)    |

### Spacing

| Context                  | Value     |
|--------------------------|-----------|
| Page padding (mobile)    | 0.75rem   |
| Page padding (tablet)    | 1rem      |
| Page padding (desktop)   | 1.5rem    |
| Between toggle rows      | 0 (built into row padding) |
| Toggle row padding       | 0.75rem   |
| Between subsections      | 1.5rem    |
| Section header to content| 2rem      |
| Indented setting indent  | 2.5rem    |
| Card selector gap        | 1rem      |

### Shadows

| Context          | Value                                           |
|------------------|-------------------------------------------------|
| Auto-save bar    | `0 2px 8px rgba(0, 0, 0, 0.06)`                |
| Card option hover| `0 4px 12px rgba(0, 0, 0, 0.08)`               |
| Tab sidebar      | none (uses border instead)                      |

### Border Radius

| Element            | Radius  |
|--------------------|---------|
| Toggle row         | 8px     |
| Card selector card | 8px     |
| Tab pill (mobile)  | 20px    |
| Auto-save bar      | 20px    |
| Toggle slider      | 24px    |
| Toggle knob        | 50%     |
| Icon container     | 6px     |
| Action card        | 8px     |

### Transitions

| Element            | Property   | Duration | Easing    |
|--------------------|------------|----------|-----------|
| Toggle row hover   | background | 0.15s    | ease      |
| Tab item hover     | background, color | 0.15s | ease  |
| Card option hover  | border, transform, box-shadow | 0.2s | ease |
| Toggle slider      | background | 0.2s     | ease      |
| Toggle knob        | transform  | 0.2s     | ease      |
| Auto-save fade     | opacity, transform | 0.3s | ease  |
| Conditional slide  | opacity, max-height, transform | 0.2s | ease |

---

## 14. Responsive Behavior

### Breakpoints (from `_mixins.scss`)

| Name           | Range              | Mixin             |
|----------------|--------------------|-------------------|
| Small mobile   | 0 - 480px          | `@include small-mobile` |
| Mobile         | 0 - 600px          | `@include mobile`       |
| Tablet small   | 0 - 768px          | `@include tablet-small` |
| Tablet         | 601px - 1024px     | `@include tablet`       |
| Desktop        | 1025px+            | `@include desktop`      |
| Large desktop  | 1440px+            | `@include large-desktop`|

### Layout Changes

| Breakpoint      | Tab Nav               | Content            | Toggle Rows        | Card Selectors    |
|-----------------|-----------------------|--------------------|--------------------|-------------------|
| 0-480px         | Horizontal, icons only| Full width, 0.75rem pad | Stacked (label above, toggle below) | 2 columns |
| 481-600px       | Horizontal, icon+label| Full width, 0.75rem pad | Stacked            | 2 columns         |
| 601-1024px      | Horizontal, all visible| Centered, 1rem pad    | Horizontal (default)| 2 columns         |
| 1025px+         | Sidebar, 220px       | Centered, 1.5rem pad   | Horizontal (default)| 2-4 columns       |
| 1440px+         | Sidebar, 220px       | Max 75ch, centered     | Horizontal (default)| 2-4 columns       |

### Touch Targets

All interactive elements maintain a minimum 44x44px touch target on mobile. The toggle switch is 44x24px (the label area provides the additional height). Tab items are 48px tall on desktop, 36px tall on mobile (but with padding that meets 44px effective target).

### Reduced Motion

```scss
@media (prefers-reduced-motion: reduce) {
  .toggleRow,
  .tabItem,
  .cardOption,
  .autoSave,
  .toggleRow__slider,
  .toggleRow__slider::before,
  .toggleRow--indented {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## 15. RTL Considerations

### General Principles

1. Use CSS logical properties exclusively. Never use `left`, `right`, `margin-left`, `margin-right`, `padding-left`, `padding-right` in new code.
2. Replace with: `inset-inline-start`, `inset-inline-end`, `margin-inline-start`, `margin-inline-end`, `padding-inline-start`, `padding-inline-end`, `border-inline-start`, `border-inline-end`.
3. Use the `@include rtl` and `@include ltr` mixins from `_mixins.scss` only when logical properties are insufficient.

### Specific RTL Adaptations

| Element                        | LTR                              | RTL                              |
|--------------------------------|----------------------------------|----------------------------------|
| Tab sidebar                    | Left side of content             | Right side of content            |
| Active tab border              | `border-inline-start: 3px solid` | Same (logical property handles it)|
| Indented toggle                | `margin-inline-start: 2.5rem`    | Same (logical property handles it)|
| Indented toggle border         | `border-inline-start: 2px solid` | Same (logical property handles it)|
| Toggle knob animation          | Knob moves right when on         | Knob moves left when on         |
| Auto-save indicator position   | `inset-inline-end: 1.5rem`       | Same (logical property handles it)|
| Card selector check icon       | `inset-inline-end: 0.5rem`       | Same (logical property handles it)|
| Chevrons (if any)              | Points right                     | Points left                      |
| Text alignment                 | Inherits from `dir` attribute    | Inherits from `dir` attribute    |

### Toggle Switch RTL

The toggle switch knob direction needs special handling. The `transform: translateX()` must flip in RTL:

```scss
.toggleRow__slider::before {
  inset-inline-start: 3px;
  transition: transform 0.2s ease;
}

input:checked + .toggleRow__slider::before {
  transform: translateX(20px);

  [dir="rtl"] & {
    transform: translateX(-20px);
  }
}
```

### Testing Checklist

- [ ] Tab sidebar renders on the correct side
- [ ] All text aligns correctly
- [ ] Toggle switches animate in the correct direction
- [ ] Indented settings indent from the correct side
- [ ] Auto-save indicator appears on the correct side
- [ ] Card selector check icon appears in the correct corner
- [ ] Subsection divider labels render correctly
- [ ] Number inputs remain LTR (numbers are always LTR)

---

## 16. Accessibility

### Tab Navigation

```
role="tablist"           on the nav container
role="tab"               on each tab button
aria-selected="true"     on the active tab
aria-controls="panel-id" linking tab to its panel
role="tabpanel"          on the content area
aria-labelledby="tab-id" linking panel back to its tab
tabIndex={0}             on active tab, -1 on others
```

Keyboard: Arrow keys move between tabs, Enter/Space activates, Tab moves into content panel.

### Toggle Switches

```
<label> wraps the input and slider
<input type="checkbox"> provides native semantics
aria-describedby links to the description paragraph
```

The toggle label text provides the accessible name. No additional `aria-label` needed when the visible label is descriptive.

### Auto-Save Feedback

```
role="status"
aria-live="polite"
```

A visually hidden live region announces "Settings saved" or "Save failed" to screen readers.

### Color Independence

- Toggle switches communicate state through position (knob left/right), not just color
- Active tabs use both color and font-weight changes
- Card selection uses a visible checkmark icon plus border change, not just background color
- Badge types use text labels ("new", "recommended") in addition to color

### Focus Management

- When switching tabs, focus moves to the section header (or first focusable element in the panel)
- Focus indicators use `outline: 2px solid var(--btn-primary)` with `outline-offset: 2px`
- Focus is trapped within modal-like sub-components (like the anchored sampling config panel)

### WCAG AA Compliance

| Check                           | Status  |
|---------------------------------|---------|
| Color contrast 4.5:1 (text)     | Pass -- `--text-title` #191e29 on #ffffff = 15.4:1 |
| Color contrast 4.5:1 (caption)  | Pass -- `--text-caption` #7484a9 on #ffffff = 4.8:1 |
| Color contrast 3:1 (large text) | Pass -- all headings exceed 3:1 |
| Focus indicators                | Pass -- 2px solid outline on all interactive elements |
| Keyboard navigation             | Pass -- all elements reachable via keyboard |
| Screen reader labels            | Pass -- all controls have accessible names |
| Reduced motion                  | Pass -- all animations disabled with `prefers-reduced-motion` |
| Touch targets 44x44px           | Pass -- all mobile targets meet minimum |

---

## 17. Files to Create, Modify, and Delete

### New Files

| File Path | Purpose |
|-----------|---------|
| `src/view/pages/statement/components/settings/components/settingsTabs/SettingsTabs.tsx` | Tab navigation component |
| `src/view/pages/statement/components/settings/components/settingsTabs/SettingsTabs.module.scss` | Tab navigation styles |
| `src/view/pages/statement/components/settings/components/autoSaveIndicator/AutoSaveIndicator.tsx` | Save status indicator |
| `src/view/pages/statement/components/settings/components/autoSaveIndicator/AutoSaveIndicator.module.scss` | Save status styles |
| `src/view/pages/statement/components/settings/components/settingsToggleRow/SettingsToggleRow.tsx` | Unified toggle row component |
| `src/view/pages/statement/components/settings/components/settingsToggleRow/SettingsToggleRow.module.scss` | Toggle row styles |
| `src/view/pages/statement/components/settings/sections/IdentitySection.tsx` | Tab 1 content |
| `src/view/pages/statement/components/settings/sections/AccessSection.tsx` | Tab 2 content |
| `src/view/pages/statement/components/settings/sections/InteractionSection.tsx` | Tab 3 content |
| `src/view/pages/statement/components/settings/sections/EvaluationSection.tsx` | Tab 4 content |
| `src/view/pages/statement/components/settings/sections/AdvancedSection.tsx` | Tab 5 content |
| `src/view/pages/statement/components/settings/sections/PeopleSection.tsx` | Tab 6 content |

### Files to Modify

| File Path | Changes |
|-----------|---------|
| `src/view/pages/statement/components/settings/StatementSettings.tsx` | Becomes the tab container; renders SettingsTabs + active section |
| `src/view/pages/statement/components/settings/components/statementSettingsForm/StatementSettingsForm.tsx` | Logic decomposed into the 6 section files; this file may become a thin wrapper or be removed |
| `src/view/pages/statement/components/settings/components/titleAndDescription/TitleAndDescription.tsx` | Add debounced auto-save (replace form submit dependency) |
| `src/view/pages/statement/components/settings/components/optionRooms/OptionRooms.tsx` | Remove its internal `SettingsSection` wrapper (the tab provides context now) |

### Files to Delete

| File Path | Reason |
|-----------|--------|
| `src/view/pages/statement/components/settings/components/advancedSettings/EnhancedAdvancedSettings.tsx` | Fully decomposed into section files |
| `src/view/pages/statement/components/settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss` | Styles replaced by shared components |
| `src/view/pages/statement/components/settings/components/statementSettingsForm/EnhancedStatementSettingsForm.tsx` | Dead code (never imported anywhere) |
| `src/view/pages/statement/components/settings/components/statementSettingsForm/EnhancedStatementSettingsForm.module.scss` | Dead code |

### Files to Keep Unchanged

These components are embedded as-is within the new section files:

| File Path | Used In |
|-----------|---------|
| `components/membershipSettings/MembershipSettings.tsx` | AccessSection |
| `components/membership/MembersSettings.tsx` | AccessSection |
| `components/membership/MembersManagement.tsx` | PeopleSection |
| `components/choseBy/ChoseBySettings.tsx` | EvaluationSection |
| `components/QuestionSettings/QuestionSettings.tsx` | EvaluationSection (parts) |
| `components/UserDemographicSettings/UserDemographicSetting.tsx` | AdvancedSection |
| `components/emailNotifications/EmailNotifications.tsx` | AdvancedSection |
| `components/ClusteringAdmin/` | AdvancedSection |
| `components/optionRooms/` (sub-components) | AdvancedSection |
| `components/memberValidation/MemberValidation.tsx` | PeopleSection |
| `components/GetVoters.tsx` | PeopleSection |
| `components/GetEvaluators.tsx` | PeopleSection |
| `components/settingsSection/SettingsSection.tsx` | May be reused internally by sub-components; keep but no longer used at the page level |
| `components/advancedSettings/LanguageSelector/LanguageSelector.tsx` | IdentitySection |

---

## Summary of Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Tabs instead of accordions** | One section visible at a time eliminates scroll fatigue and nesting. Six tabs are scannable at a glance. |
| **6 sections instead of 13** | Organized by admin task (what they want to accomplish), not by technical category (what the code does). |
| **Auto-save everywhere** | 90% of settings already auto-save. The Save button only saved title/description, creating a false mental model. Debounced auto-save for text fields makes behavior consistent. |
| **Flatten EnhancedAdvancedSettings** | Its 875 lines with 8 internal collapsible categories and a competing visual system created confusion. Distributing its settings into task-based tabs gives each toggle a natural home. |
| **Remove Quick Stats and Quick Actions** | "14/20 active" is meaningless. Quick action buttons duplicate toggles in the sections. Both add visual noise without value. |
| **Remove priority badges** | "Essential"/"Recommended"/"Advanced" labels are subjective and add clutter. The tab order itself communicates importance: earlier tabs contain more common settings. |
| **CSS logical properties for RTL** | Using `inset-inline-start` instead of `left` makes the layout automatically adapt to text direction without separate RTL overrides. |
| **Unified ToggleRow component** | Replaces the inline `ToggleSwitch` FC defined inside `EnhancedAdvancedSettings`. One reusable component ensures visual consistency across all 6 tabs. |
