# Schema Migration Guide

## Overview
This document outlines the migration process from the old mass consensus schema to the new schema.

## Current Schema (Old)
<!-- Describe the current schema structure here -->

```typescript
import {
	array,
	object,
	string,
	enum_,
	optional,
	null_,
	InferOutput,
	number,
	nullable,
	record,
} from 'valibot';

import { CreatorSchema, LoginType } from '../user/User';

export enum MassConsensusPageUrls {
	introduction = "introduction",
	userDemographics = "user-demographics",
	initialQuestion = "initial-question", 
	question = "question",
	randomSuggestions = "random-suggestions",
	topSuggestions = "top-suggestions",
	voting = "voting",
	leaveFeedback = "leave-feedback",
	thankYou = "thank-you"
}


export const MassConsensusPageUrlsSchema = enum_(MassConsensusPageUrls);

export const MassConsensusSchema = object({
	texts: optional(
		object({
			introduction: string(),
			suggestionQuestion: string(),
			similarSuggestions: string(),
			randomSuggestions: string(),
			topSuggestions: string(),
			voting: string(),
		})
	),
	steps: array(MassConsensusPageUrlsSchema),
	currentStep: optional(MassConsensusPageUrlsSchema),
});

export type MassConsensus = InferOutput<typeof MassConsensusSchema>;

export const GeneratedStatementSchema = object({
	statement: string(),
	statementId: null_(),
});

export type GeneratedStatement = InferOutput<typeof GeneratedStatementSchema>;


export const MassConsensusMemberSchema = object({
	statementId: string(),
	lastUpdate: number(),
	email: optional(nullable(string())),
	creator: CreatorSchema
});

export type MassConsensusMember = InferOutput<typeof MassConsensusMemberSchema>;

export const MassConsensusProcessSchema = object({
	statementId: string(),
	loginTypes: record(
		enum_(LoginType),
		object({
			steps: array(MassConsensusPageUrlsSchema),
			processName: optional(string()),
			currentStep: optional(number()),
		})
	)
});

export type MassConsensusProcess = InferOutput<typeof MassConsensusProcessSchema>;





```
## Target Schema (New)
<!-- Describe the new schema structure here -->

```typescript
// Define the new schema structure here
import {
	array,
	object,
	string,
	enum_,
	optional,
	null_,
	InferOutput,
	number,
	nullable,
	record,
} from 'valibot';

import { CreatorSchema, LoginType } from '../user/User';

export enum MassConsensusPageUrls {
	introduction = "introduction",
	userDemographics = "user-demographics",
	initialQuestion = "initial-question", 
	question = "question",
	randomSuggestions = "random-suggestions",
	topSuggestions = "top-suggestions",
	voting = "voting",
	leaveFeedback = "leave-feedback",
	thankYou = "thank-you"
}


export const MassConsensusPageUrlsSchema = enum_(MassConsensusPageUrls);

export const MassConsensusSchema = object({
	texts: optional(
		object({
			introduction: string(),
			suggestionQuestion: string(),
			similarSuggestions: string(),
			randomSuggestions: string(),
			topSuggestions: string(),
			voting: string(),
		})
	),
	steps: array(MassConsensusPageUrlsSchema),
	currentStep: optional(MassConsensusPageUrlsSchema),
});

export type MassConsensus = InferOutput<typeof MassConsensusSchema>;

export const GeneratedStatementSchema = object({
	statement: string(),
	statementId: null_(),
});

export type GeneratedStatement = InferOutput<typeof GeneratedStatementSchema>;

export const MassConsensusStepSchema = object({
	screen: MassConsensusPageUrlsSchema,
	text: optional(string()),
	statementId: string(),
});

export type MassConsensusStep = InferOutput<typeof MassConsensusStepSchema>;

export const MassConsensusMemberSchema = object({
	statementId: string(),
	lastUpdate: number(),
	email: optional(nullable(string())),
	creator: CreatorSchema
});

export type MassConsensusMember = InferOutput<typeof MassConsensusMemberSchema>;

export const MassConsensusProcessSchema = object({
	statementId: string(),
	loginTypes: record(
		enum_(LoginType),
		object({
			steps: array(MassConsensusStepSchema),
			processName: optional(string()),
			currentStep: optional(number()),
		})
	)
});

export type MassConsensusProcess = InferOutput<typeof MassConsensusProcessSchema>;

```

## Migration Steps

### 1. Pre-Migration Checklist
- [ ] Backup existing data
- [ ] Review all affected components
- [ ] Test migration script in development

### 2. Data Transformation

#### Key Changes
1. **MassConsensusStepSchema** - NEW type added
   - Contains: `screen`, `text`, `statementId`
   
2. **MassConsensusProcessSchema.loginTypes.steps**
   - OLD: `array(MassConsensusPageUrlsSchema)` - array of enum strings
   - NEW: `array(MassConsensusStepSchema)` - array of objects with screen, text, statementId

#### Transformation Logic
```typescript
// Transform old steps array to new format
function transformSteps(oldSteps: MassConsensusPageUrls[], statementId: string): MassConsensusStep[] {
  return oldSteps.map(step => ({
    screen: step,
    text: undefined, // Or map from texts object if available
    statementId: statementId
  }));
}
```

### 3. Code Changes Required

#### Type Definition Files
1. **src/model/massConsensus/MassConsensus.ts**
   - Add `MassConsensusStepSchema` definition
   - Update `MassConsensusProcessSchema` to use `MassConsensusStepSchema`

#### Redux Slices
2. **src/model/massConsensus/massConsensusProcessSlice.ts**
   - Update state type to use new schema
   - Modify reducers handling steps array
   - Update navigation logic for step objects

3. **src/model/massConsensus/massConsensusSlice.ts**
   - Update any references to process steps

#### React Components
4. **src/view/pages/massConsensus/MassConsensus.tsx**
   - Main container component
   - Update step navigation logic
   - Handle new step object structure

5. **src/view/pages/massConsensus/components/MassConsensusSteps.tsx**
   - Update to handle step objects instead of enum values
   - Access `step.screen` instead of direct enum value

6. **src/view/pages/massConsensus/components/stepsPages/**
   - All step components may need updates to handle new data structure
   - Components: Introduction, UserDemographics, InitialQuestion, etc.

#### Hooks
7. **src/view/hooks/massConsensusHooks.ts**
   - Update `useMassConsensusNav` to work with step objects
   - Modify step comparison logic

8. **src/controllers/hooks/massConsensus/setMassConsensusPageHook.ts**
   - Update page setting logic for new structure

#### Firebase Functions
9. **functions/src/fn_mass-consensus/**
   - Update all functions handling mass consensus data
   - Ensure data validation uses new schema

10. **functions/src/fn_mass-consensus/set/setMassConsensusProcess.ts**
    - Critical: Update to handle new step structure

### 4. Database Migration

#### Firestore Collections Affected
- `statements/{statementId}/massConsensus/processes`
- `statements/{statementId}/massConsensus/members`

#### Migration Script
```typescript
// Pseudo-code for database migration
async function migrateMassConsensusProcesses() {
  const processes = await getAllProcesses();
  
  for (const process of processes) {
    const updatedLoginTypes = {};
    
    for (const [loginType, config] of Object.entries(process.loginTypes)) {
      updatedLoginTypes[loginType] = {
        ...config,
        steps: config.steps.map(step => ({
          screen: step,
          text: undefined,
          statementId: process.statementId
        }))
      };
    }
    
    await updateProcess(process.id, { loginTypes: updatedLoginTypes });
  }
}
```

### 5. Testing Strategy
- Unit tests for transformation functions
- Integration tests for Redux state updates
- E2E tests for complete mass consensus flow
- Test each step page component
- Verify Firebase function validations

### 6. Rollback Plan
- Keep backup of old schema file
- Create database backup before migration
- Version control for all code changes
- Feature flag to switch between schemas if needed

## Affected Components

### Critical Files (Must Update)
- `src/model/massConsensus/MassConsensus.ts`
- `src/model/massConsensus/massConsensusProcessSlice.ts`
- `src/view/pages/massConsensus/MassConsensus.tsx`
- `src/view/pages/massConsensus/components/MassConsensusSteps.tsx`
- `src/view/hooks/massConsensusHooks.ts`
- `functions/src/fn_mass-consensus/set/setMassConsensusProcess.ts`

### Secondary Files (Review & Update as Needed)
- `src/controllers/hooks/massConsensus/setMassConsensusPageHook.ts`
- `src/view/pages/massConsensus/components/stepsPages/*`
- All Firebase functions in `functions/src/fn_mass-consensus/`
- Test files related to mass consensus

## Timeline

### Phase 1: Preparation (Day 1)
- Create feature branch
- Backup production database
- Update type definitions in `MassConsensus.ts`

### Phase 2: Code Updates (Day 2-3)
- Update Redux slices
- Modify React components
- Update hooks
- Update Firebase functions

### Phase 3: Testing (Day 4)
- Run unit tests
- Test migration script locally
- E2E testing of full flow

### Phase 4: Deployment (Day 5)
- Deploy to staging
- Run migration script on staging data
- Verify functionality
- Deploy to production

## Notes

### Breaking Changes
- The `steps` array structure changes from simple enum values to objects
- All code accessing steps must use `step.screen` instead of direct value
- Firebase functions need validation updates

### Migration Considerations
- The migration is **non-reversible** once applied to production
- All clients must be updated before or simultaneously with backend
- Consider using feature flags for gradual rollout

### Data Compatibility
- Old format: `steps: ["introduction", "question", "voting"]`
- New format: `steps: [{ screen: "introduction", text: "...", statementId: "..." }, ...]`

### Risk Assessment
- **High Risk**: Redux state management changes
- **Medium Risk**: Component prop changes
- **Low Risk**: Adding new schema definitions

### Recommended Order of Implementation
1. Add new type definitions (backward compatible)
2. Create transformation utilities
3. Update Firebase functions with dual schema support
4. Update frontend components
5. Run migration script
6. Remove old schema support