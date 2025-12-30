# Survey E2E Tests

This document describes the E2E test scenarios for the Survey feature in Mass Consensus.

## Test Environment
- Base URL: `http://localhost:3001`
- Test Survey ID: Use an existing survey or create one via API
- Test Survey with Demographics: `survey_1766994415920_muisxim`

## Test Results (Last Run: 2025-12-29)

### Participant Flow - PASSED

| Test | Status | Notes |
|------|--------|-------|
| Welcome page loads | PASSED | Title, question count, and start button displayed |
| Start survey navigation | PASSED | Redirects to `/q/0` (first flow item) |
| Demographic page at position 0 | PASSED | Shows political position question with radio options |
| Demographic form submission | PASSED | Selection saved, navigates to question |
| Question evaluation | PASSED | 5-point scale (-1 to +1) works correctly |
| Minimum evaluations enforcement | PASSED | Next button enabled after 3 evaluations |
| Navigation between questions | PASSED | Back and Next buttons work |
| Survey completion | PASSED | Shows completion page with stats |

## Test Scenarios

### 1. Survey Welcome Page (`/s/[surveyId]`)

**Test: Welcome page loads correctly**
- Navigate to `/s/[surveyId]`
- Verify survey title is displayed
- Verify question count badge (e.g., "2 שאלות")
- Verify "Start Survey" button is visible
- Verify "How it works" instructions are shown

**Test: Start survey navigation**
- Click "התחל סקר" (Start Survey) button
- Verify navigation to first flow item (`/s/[surveyId]/q/0`)

### 2. Survey Question Flow (`/s/[surveyId]/q/[index]`)

**Test: Question page displays correctly**
- Navigate to question page
- Verify question heading is displayed
- Verify options/solutions are shown with evaluation buttons
- Verify progress bar shows current position (e.g., "שאלה 2 מתוך 3")
- Verify navigation buttons (חזור/הבא) are shown

**Test: Question evaluation**
- Click evaluation buttons (👎👎 to 👍👍 scale)
- Verify button becomes active/selected
- Verify evaluation counter updates (e.g., "3/7 העריכו")
- Verify "Next" button becomes enabled after minimum evaluations (default: 3)

**Test: Navigation between questions**
- Complete minimum evaluations
- Click "הבא" (Next) button
- Verify navigation to next question
- Test "חזור" (Back) button navigation
- Verify evaluations are preserved when returning

### 3. Demographic Page Flow

**Test: Demographic page displays correctly**
- Navigate to demographic page in flow (position 0, 1+, or -1)
- Verify page title is displayed (e.g., "עמדותיך הפוליטיות")
- Verify "אודותייך" (About You) label in progress bar
- Verify demographic questions are shown
- Verify form controls (radio buttons, text inputs)

**Test: Demographic form submission**
- Select required demographic options
- Click "הבא" (Next) button
- Verify data is saved (no error)
- Verify navigation to next flow item

### 4. Survey Completion (`/s/[surveyId]/complete`)

**Test: Completion page displays**
- Complete all survey questions and demographics
- Verify redirect to `/complete` page
- Verify "הסקר הושלם!" (Survey Completed!) message
- Verify stats display (questions answered / total)
- Verify email signup form is shown
- Verify "סקור תשובות" (Review Answers) button

### 5. Survey Resume Functionality

**Test: Resume modal shows for in-progress survey**
- Start a survey and complete some questions
- Navigate away and return to welcome page
- Verify resume modal appears
- Test "Continue" option
- Test "Start Over" option

## Admin Flow Tests

### 6. Survey List (`/admin/surveys`)

**Test: Survey list loads**
- Navigate to admin surveys page
- Verify survey cards are displayed
- Verify survey titles and status badges (פעיל/draft/closed)
- Verify question count displayed
- Verify response statistics (responses, completion rate)
- Verify action buttons (ערוך, תצוגה מקדימה, מחק)

### 7. Survey Creation (`/admin/surveys/new`)

**Test: Create new survey**
- Navigate to create survey page
- Fill in survey title
- Add description
- Save survey
- Verify survey is created and redirects to edit page

### 8. Survey Editing (`/admin/surveys/[id]`)

**Test: Edit survey details**
- Navigate to survey edit page
- Modify title and description
- Save changes
- Verify changes are persisted

**Test: Add questions to survey**
- Use question picker to search questions
- Select questions to add
- Verify questions appear in list
- Reorder questions using drag-and-drop

**Test: Configure demographics**
- Add demographic page
- Configure position (before/after questions)
- Add demographic questions
- Save configuration

**Test: Configure survey settings**
- Toggle allowSkipping setting
- Adjust minEvaluationsPerQuestion
- Toggle other settings
- Verify settings are saved

## Running E2E Tests

### Manual Testing with Playwright MCP

1. **Start the app:**
   ```bash
   cd apps/mass-consensus && npm run dev
   ```

2. **Use Playwright MCP tools:**
   ```
   mcp__playwright__browser_navigate - Navigate to pages
   mcp__playwright__browser_snapshot - Capture page state (accessibility tree)
   mcp__playwright__browser_click - Click elements
   mcp__playwright__browser_type - Fill text inputs
   mcp__playwright__browser_take_screenshot - Capture visual screenshots
   ```

3. **Example test flow:**
   ```
   # Navigate to survey
   mcp__playwright__browser_navigate url=http://localhost:3001/s/[surveyId]

   # Capture initial state
   mcp__playwright__browser_snapshot

   # Click start button
   mcp__playwright__browser_click element="Start Survey" ref="e16"

   # Verify navigation
   mcp__playwright__browser_snapshot
   ```

## Known Issues

1. **Page title bug**: On question pages, the page title may show "Question Not Found" even when content displays correctly. This is a minor bug in the title metadata handling.

## Test Data

### Test Survey Structure
```
Survey: "בדיקה עם דמוגרפיה"
├── Demographic Page (position: 0)
│   └── Question: "מה עמדותייך הפוליטיות?"
│       ├── Option: ימין
│       └── Option: שמאל
├── Question 1: "על מה נדבר?"
│   └── 7 options to evaluate
└── Question 2: "על מה נחלום?"
    └── 6 options to evaluate
```

### Survey Settings
- minEvaluationsPerQuestion: 3
- allowSkipping: false
- allowReturning: true
