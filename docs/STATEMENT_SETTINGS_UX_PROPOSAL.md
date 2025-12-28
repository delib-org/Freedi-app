# Statement Settings Page - UX Architecture Proposal

## Executive Summary

The current Statement Settings page suffers from fragmented information architecture, with settings scattered across multiple sections without clear logical grouping. This document proposes a restructured hierarchy that groups related functionality, eliminates confusion between overlapping concepts (particularly "rooms"), and creates an intuitive flow for administrators.

---

## Current State Analysis

### Current Page Structure

```
StatementSettings.tsx
|
+-- StatementSettingsForm
|   +-- TitleAndDescription (Title, Description, Image upload)
|   +-- EnhancedAdvancedSettings (appears under "General Settings")
|   +-- Save button
|
+-- MembershipSettings (Access levels: Public, Open to All, Registered, etc.)
+-- MembersSettings (Joined members list, banned users, share link)
+-- ChoseBySettings (Question only - Results criteria)
+-- QuestionSettings (Question only - Evaluation type, Mass Consensus, Anchored sampling)
+-- UserDemographicSetting (Survey questions for members)
+-- MemberValidation (Question only - Review member responses)
+-- EmailNotifications (Send emails to subscribers)
+-- ClusteringAdmin (Question only - AI framings)
+-- GetVoters / GetEvaluators (Member participation tracking)
+-- MembersManagement (already shown via MembershipSettings)
+-- RoomAssignment (Question only - Physical room assignment)
```

### Current "Advanced Settings" Categories (inside EnhancedAdvancedSettings)

1. **Visibility & Access**
   - Hide this statement
   - Chat
   - Enable Sub-Conversations

2. **Smart Join** (Question only)
   - Enable Smart Join toggle
   - Single option join only
   - Team Size Limits (min/max)
   - Room Splitting (when max is set)

3. **Participation & Collaboration**
   - Allow participants to contribute options to voting page
   - Allow participants to contribute options to evaluation page

4. **Evaluation & Voting**
   - Evaluation Type selector
   - Vote limiting (for single-like)
   - Show Evaluations results
   - Enable user voting/evaluation
   - In Voting page, show only top results
   - Enable Submit Mode

5. **AI & Automation**
   - Enable AI suggestion improvement
   - Allow similarity search
   - By default, look for similar statements

6. **Discussion Framework** (Question only)
   - Enable Popper-Hebbian Discussion Mode
   - Enable AI Pre-Check for Options

7. **Localization**
   - Survey Default Language
   - Force survey language

8. **Navigation & Structure**
   - Enable add new sub-questions button
   - Navigational elements

---

## Problems Identified

### 1. Room Confusion (Primary Issue)
**The term "rooms" appears in TWO distinct contexts:**

| Location | Purpose | Concept |
|----------|---------|---------|
| Advanced Settings > Smart Join > Room Splitting | Split oversized teams into smaller groups based on join limits | **Virtual team splitting** |
| RoomAssignment (separate section) | Assign participants to physical/virtual rooms for breakout sessions | **Session room assignment** |

**User Impact:** Administrators cannot understand which "room" feature to use, leading to misconfiguration.

### 2. Scattered Member Management
- **MembershipSettings**: Access control
- **MembersSettings**: View members, share links
- **MemberValidation**: Review member responses
- **GetVoters/GetEvaluators**: Participation tracking

These are conceptually related but scattered across the page.

### 3. Evaluation Settings Split
- **QuestionSettings**: Evaluation type, anchored sampling
- **AdvancedSettings > Evaluation & Voting**: Evaluation toggles, vote limiting
- **ChoseBySettings**: Results calculation method

### 4. No Clear Hierarchy
Settings appear as a flat list without clear parent-child relationships, making it hard to understand dependencies.

### 5. Inconsistent Naming
- "Smart Join" vs "Team Formation"
- "Room Splitting" vs "Room Assignment"
- "Survey" vs "Member Information"

---

## Proposed Information Architecture

### New Hierarchical Structure

```
STATEMENT SETTINGS
|
+-- BASIC INFORMATION
|   +-- Title & Description
|   +-- Cover Image
|   +-- Statement Visibility (Hide toggle)
|
+-- ACCESS & MEMBERSHIP
|   +-- Access Level (Public -> Secret spectrum)
|   +-- Inherit from Parent (sub-statements)
|   +-- Membership Requirements
|       +-- Survey Questions (demographics)
|       +-- Member Validation & Review
|   +-- Member Directory
|       +-- View Joined Members
|       +-- View Banned Users
|       +-- Share Invitation Link
|
+-- DISCUSSION FEATURES
|   +-- Content Options
|       +-- Enable Chat
|       +-- Enable Sub-Conversations
|       +-- Enable Sub-Questions Button
|       +-- Navigational Elements
|   +-- Participant Contributions
|       +-- Allow adding options to Voting page
|       +-- Allow adding options to Evaluation page
|   +-- Discussion Mode
|       +-- Enable Popper-Hebbian Mode
|       +-- AI Pre-Check for Options
|
+-- EVALUATION & VOTING (Question statements only)
|   +-- Evaluation Interface
|       +-- Agreement / Voting / Approval / Cluster selector
|       +-- Voting-specific settings
|   +-- Evaluation Behavior
|       +-- Enable user evaluation toggle
|       +-- Show evaluation results
|       +-- Vote limiting (for single-like)
|       +-- In Voting page, show only top results
|       +-- Enable Submit Mode
|   +-- Anchored Sampling
|       +-- Enable anchored options
|       +-- Number of anchored options
|       +-- Community badges toggle
|       +-- Badge customization
|   +-- Results Calculation
|       +-- Results method (Consensus / Most liked / Average)
|       +-- Cutoff method (Top N / Above threshold)
|       +-- Threshold slider
|
+-- TEAM FORMATION (Question statements only)
|   <<< Previously "Smart Join" - renamed for clarity >>>
|   +-- Enable Team Formation
|   +-- Join Behavior
|       +-- Single option join only
|   +-- Team Size Constraints
|       +-- Minimum team size
|       +-- Maximum team size
|   +-- Oversized Team Management
|       +-- Auto-split toggle
|       +-- Room size for splitting
|       +-- View & split oversized teams
|
+-- BREAKOUT ROOMS (Question statements only)
|   <<< Previously "Room Assignment" - new name for clarity >>>
|   +-- Room Configuration
|       +-- Room size
|       +-- Scramble by demographics
|   +-- Room Management
|       +-- View current rooms
|       +-- Reassign participants
|       +-- Notify participants
|
+-- AI FEATURES
|   +-- Content Enhancement
|       +-- AI suggestion improvement
|       +-- Similarity search
|       +-- Default similarity checking
|   +-- Clustering & Framings
|       +-- Generate AI framings
|       +-- Custom framing requests
|       +-- View cluster aggregations
|
+-- LOCALIZATION
|   +-- Survey Default Language
|   +-- Force language preference
|   +-- Question Link (Mass Consensus URL)
|
+-- COMMUNICATION
|   +-- Email Notifications
|       +-- Subscriber count
|       +-- Send email to subscribers
|
+-- ANALYTICS (expandable)
|   +-- Participation Tracking
|       +-- Get Voters
|       +-- Get Non-Voters
|       +-- Get Evaluators
```

---

## Key Changes & Rationale

### 1. Rename "Smart Join" to "Team Formation"
**Why:** "Smart Join" is vague and doesn't communicate the feature's purpose. "Team Formation" clearly indicates it's about forming participant teams around options.

### 2. Rename "Room Assignment" to "Breakout Rooms"
**Why:** Distinguishes this feature from "Oversized Team Management" (splitting). "Breakout rooms" is industry-standard terminology for session-based groupings.

### 3. Create Separate "Team Formation" and "Breakout Rooms" Sections
**Why:** These serve fundamentally different purposes:
- **Team Formation**: People joining options and forming teams
- **Breakout Rooms**: Admin assigning participants to discussion groups

### 4. Consolidate Member-Related Settings
**Why:** Everything related to members (access, viewing, validation, surveys) should be in one logical section called "Access & Membership."

### 5. Consolidate Evaluation Settings
**Why:** All evaluation-related settings (interface type, behavior, anchoring, results) should be together for easier configuration.

### 6. Restructure "Advanced Settings"
**Why:** "Advanced Settings" became a dumping ground. Each setting should be in its logical category, with only truly advanced/power-user settings labeled as such.

---

## Visual Design Recommendations

### 1. Section Cards
Each major category should be a distinct card with:
- Clear heading
- Optional description
- Collapsible content
- Visual icon for quick recognition

### 2. Progressive Disclosure
- Show only relevant sections for statement type (question vs option vs statement)
- Collapse less-used sections by default
- Expand dependent settings only when parent toggle is enabled

### 3. Visual Hierarchy
```scss
// Level 1: Major sections
.settings-section {
  background: var(--card-default);
  border-radius: 12px;
  padding: var(--padding);
  margin-bottom: 1rem;
}

// Level 2: Subsections
.settings-subsection {
  padding-left: 1rem;
  border-left: 3px solid var(--border-light);
  margin: 0.5rem 0;
}

// Level 3: Individual settings
.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
}
```

### 4. Contextual Help
- Add tooltip icons with explanations
- Show "Learn more" links for complex features
- Display dependencies ("Requires X to be enabled")

### 5. Status Indicators
- Show which sections have been configured
- Display warning badges for incomplete required settings
- Indicate inherited vs overridden settings

---

## Implementation Roadmap

### Phase 1: Immediate (1-2 days)
1. Rename "Smart Join" to "Team Formation" in UI
2. Rename "Room Splitting" to "Oversized Team Management"
3. Rename "Room Assignment" to "Breakout Rooms"
4. Add clear descriptions to both room-related features

### Phase 2: Short-term (1 week)
1. Create new section component with consistent styling
2. Reorganize evaluation settings into one section
3. Consolidate member management settings
4. Add progressive disclosure (hide sections for irrelevant statement types)

### Phase 3: Medium-term (2-3 weeks)
1. Implement collapsible sections
2. Add contextual help tooltips
3. Create status indicators for sections
4. Add visual icons for each major category

### Phase 4: Long-term (1 month+)
1. Add onboarding tour for first-time users
2. Create "Quick Setup" wizard for common configurations
3. Add settings templates/presets
4. Implement settings search functionality

---

## Component File Changes

### Files to Modify

| Current File | Proposed Action |
|-------------|-----------------|
| `StatementSettings.tsx` | Restructure render order, add section grouping |
| `AdvancedSettings.tsx` | Split into multiple focused components |
| `RoomAssignment.tsx` | Rename to `BreakoutRooms.tsx`, update language |
| `MembersSettings.tsx` | Merge into unified `MemberManagement.tsx` |
| `MembershipSettings.tsx` | Merge into unified `MemberManagement.tsx` |

### New Components to Create

```
components/settings/
+-- sections/
    +-- BasicInfoSection.tsx
    +-- AccessMembershipSection.tsx
    +-- DiscussionFeaturesSection.tsx
    +-- EvaluationVotingSection.tsx
    +-- TeamFormationSection.tsx
    +-- BreakoutRoomsSection.tsx
    +-- AIFeaturesSection.tsx
    +-- LocalizationSection.tsx
    +-- CommunicationSection.tsx
    +-- AnalyticsSection.tsx
+-- SettingsSection.tsx (reusable wrapper)
+-- SettingItem.tsx (reusable setting row)
```

---

## Terminology Reference

| Old Term | New Term | Context |
|----------|----------|---------|
| Smart Join | Team Formation | Joining options as teams |
| Room Splitting | Oversized Team Management | Splitting teams that exceed size limits |
| Room Assignment | Breakout Rooms | Assigning participants to discussion groups |
| Survey | Member Survey | Demographic questions |
| Member Information | Member Survey | Same as above |
| Advanced Settings | (Distributed) | Settings move to relevant categories |

---

## Success Metrics

After implementation, measure:

1. **Task Completion Rate**: % of admins who successfully configure room-related features
2. **Time to Configuration**: Average time to complete settings setup
3. **Support Tickets**: Reduction in "rooms" confusion-related support requests
4. **User Satisfaction**: Survey score for settings page usability

---

## Appendix: Current vs Proposed Component Tree

### Current Structure
```
StatementSettings
+-- StatementSettingsForm
|   +-- TitleAndDescription
|   +-- UploadImage
|   +-- EnhancedAdvancedSettings (flat list of categories)
|   +-- Save button
+-- MembershipSettings
+-- MembersSettings
+-- ChoseBySettings (question only)
+-- QuestionSettings (question only)
+-- UserDemographicSetting
+-- MemberValidation (question only)
+-- EmailNotifications
+-- ClusteringAdmin (question only)
+-- GetVoters
+-- GetEvaluators
+-- MembersManagement
+-- RoomAssignment (question only)
```

### Proposed Structure
```
StatementSettings
+-- BasicInfoSection
|   +-- TitleAndDescription
|   +-- UploadImage
|   +-- VisibilityToggle
|
+-- AccessMembershipSection
|   +-- AccessLevelSelector
|   +-- InheritanceToggle
|   +-- MemberSurvey (formerly UserDemographicSetting)
|   +-- MemberValidation
|   +-- MemberDirectory (merged MembersSettings + chips)
|
+-- DiscussionFeaturesSection
|   +-- ContentOptions (chat, sub-conversations, etc.)
|   +-- ParticipantContributions
|   +-- DiscussionMode (Popperian)
|
+-- EvaluationSection (question only)
|   +-- EvaluationInterface (from QuestionSettings)
|   +-- EvaluationBehavior (from AdvancedSettings)
|   +-- AnchoredSampling (from QuestionSettings)
|   +-- ResultsCalculation (from ChoseBySettings)
|
+-- TeamFormationSection (question only)
|   +-- (formerly Smart Join from AdvancedSettings)
|
+-- BreakoutRoomsSection (question only)
|   +-- (formerly RoomAssignment)
|
+-- AIFeaturesSection
|   +-- ContentEnhancement (from AdvancedSettings)
|   +-- ClusteringAdmin
|
+-- LocalizationSection
|   +-- (from AdvancedSettings + QuestionSettings link)
|
+-- CommunicationSection
|   +-- EmailNotifications
|
+-- AnalyticsSection
|   +-- GetVoters
|   +-- GetEvaluators
|
+-- SaveButton (fixed position)
```

---

*Document created: December 28, 2025*
*Author: UX Architecture Review*
