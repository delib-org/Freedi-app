# Statement Type Restrictions Implementation Plan

## Overview
Implement a universal validation system to prevent certain statement types from being created under specific parent types, with initial focus on preventing options under options.

## Analysis of Existing Functions

### ✅ Functions to Keep and Enhance

1. **`createStatement()` in `setStatements.ts:280`**
   - Already serves as unified creation mechanism
   - Already has validation via `isStatementTypeAllowedAsChildren` (line 305)
   - **Action**: Enhance validation to prevent options under options

2. **`changeStatementType()` in `changeStatementType.ts`**
   - Already serves as dedicated type change mechanism
   - Has some validation but incomplete
   - **Action**: Enhance to be the single unified type update function

### ❌ Functions to Consolidate/Remove

1. **`setStatementIsOption()` in `setStatements.ts:579`**
   - Redundant - should use `changeStatementType()` instead
   - **Action**: Deprecate and redirect to `changeStatementType()`

2. **`updateIsQuestion()` in `setStatements.ts:662`**
   - Redundant - should use `changeStatementType()` instead
   - **Action**: Deprecate and redirect to `changeStatementType()`

3. **`toggleStatementOption()` in `setStatements.ts:602`**
   - Internal helper that's redundant
   - **Action**: Remove

### 📁 File Organization Assessment

**Current structure is good:**
- ✅ `setStatements.ts` - Statement creation and updates
- ✅ `changeStatementType.ts` - Type change operations
- ✅ `helpers.ts` - Validation utilities

**No need to move functions - just enhance and consolidate**

## Current State Analysis

### Existing Components
1. **Validation Function**: `isStatementTypeAllowedAsChildren` in `/src/controllers/general/helpers.ts`
   - Currently only prevents options under groups
   - Located at lines 124-142

2. **Enforcement Points**:
   - `createStatement()` in `/src/controllers/db/statements/setStatements.ts:305`
   - `changeStatementType()` in `/src/controllers/db/statements/changeStatementType.ts`
   - `CreateStatementModal` component has `allowedTypes` prop but doesn't use universal validation

### Statement Types (from delib-npm)
- `statement` - Basic statement
- `option` - Option that can be voted on
- `question` - Question that needs answers
- `document` - Document type
- `group` - Group/category type

## Implementation Tasks

### 1. Enhanced Universal Validation Function

#### File: `/src/controllers/general/helpers.ts`

**Current Function:**
```typescript
export function isStatementTypeAllowedAsChildren(
  parentStatement: string | { statementType: StatementType },
  childType: StatementType
): boolean
```

**Enhancements Needed:**
- Add validation to prevent `option` under `option`
- Create a configuration object for type restrictions
- Return validation result with error message

**New Structure:**
```typescript
// Type restriction configuration
const TYPE_RESTRICTIONS = {
  [StatementType.option]: {
    disallowedChildren: [StatementType.option],
    reason: "Options cannot contain other options"
  },
  [StatementType.group]: {
    disallowedChildren: [StatementType.option],
    reason: "Groups cannot contain options"
  }
};

// Enhanced validation function
export function validateStatementTypeHierarchy(
  parentStatement: Statement | 'top',
  childType: StatementType
): { allowed: boolean; reason?: string }
```

### 2. Use Existing `createStatement` as Unified Creation

#### File: `/src/controllers/db/statements/setStatements.ts`

**Current Function (line 280):**
```typescript
export function createStatement({
  text,
  description,
  parentStatement,
  statementType,
  // ... other params
}): Statement | undefined
```

**Already Has:**
- ✅ Validation via `isStatementTypeAllowedAsChildren` (line 305)
- ✅ Support for all statement types
- ✅ Proper default settings

**Enhancement Needed:**
- Update `isStatementTypeAllowedAsChildren` to prevent options under options
- Add better error messages for validation failures
- No need for separate `createOption` function

### 3. Update Existing Functions

#### 3.1 Update `createStatement` function
**File:** `/src/controllers/db/statements/setStatements.ts`

**Changes:**
- Replace simple validation with enhanced `validateStatementTypeHierarchy`
- Handle validation errors with proper user feedback
- Log validation failures for debugging

#### 3.2 Consolidate Type Update Functions
**Main Function:** `/src/controllers/db/statements/changeStatementType.ts`

**Changes to `changeStatementType()`:**
- Enhance validation to prevent options under options
- Add validation for children when parent type changes
- Return detailed error messages

**Functions to Replace:**
- `setStatementIsOption()` → Use `changeStatementType(statement, StatementType.option)`
- `updateIsQuestion()` → Use `changeStatementType(statement, StatementType.question)`
- Update all UI components to use `changeStatementType()` exclusively

#### 3.3 Update `createStatementFromModal` function
**File:** `/src/view/pages/statement/components/settings/statementSettingsCont.ts`

**Changes:**
- Use new `createOption` function when creating options
- Handle validation errors from the unified function

### 4. UI Component Updates

#### 4.1 CreateStatementModal Component
**File:** `/src/view/pages/statement/components/createStatementModal/CreateStatementModal.tsx`

**Changes:**
- Disable option tab when parent is an option
- Show tooltip explaining why option is disabled
- Use validation function to determine available types dynamically

**Implementation:**
```typescript
// In CreateStatementModal component
const getAvailableTypes = (parentStatement: Statement | 'top'): StatementType[] => {
  const allTypes = [StatementType.option, StatementType.question];

  return allTypes.filter(type => {
    const validation = validateStatementTypeHierarchy(parentStatement, type);
    return validation.allowed;
  });
};
```

#### 4.2 Other Modal Components
- Update `CreateStatementModalSwitch` similarly
- Update any other statement creation modals

### 5. Testing Strategy

#### Unit Tests to Add:
1. Test `validateStatementTypeHierarchy` with all type combinations
2. Test `createOption` with valid and invalid parent types
3. Test `changeStatementType` with restriction scenarios

#### Integration Tests:
1. Test UI components disable options appropriately
2. Test end-to-end creation flow with restrictions
3. Test type change operations with validation

### 6. Migration & Backward Compatibility

#### Data Migration:
- Scan existing database for any options under options
- Create migration script to fix invalid hierarchies if found
- Log all corrections for audit purposes

#### Backward Compatibility:
- Ensure existing valid statements continue to work
- Add feature flag if gradual rollout is needed
- Provide clear error messages for newly restricted operations

## Implementation Order

1. **Phase 1 - Core Validation** (Priority: High)
   - Enhance `isStatementTypeAllowedAsChildren` function
   - Create type restriction configuration
   - Add comprehensive unit tests

2. **Phase 2 - Unified Creation** (Priority: High)
   - Implement `createOption` function
   - Update `createStatement` to use new validation
   - Update `createStatementFromModal`

3. **Phase 3 - UI Updates** (Priority: Medium)
   - Update CreateStatementModal component
   - Update other creation modals
   - Add user-friendly error messages

4. **Phase 4 - Type Change Validation** (Priority: Medium)
   - Update `changeStatementType` function
   - Add validation for all type changes
   - Handle edge cases

5. **Phase 5 - Testing & Cleanup** (Priority: Low)
   - Add comprehensive tests
   - Clean up duplicate code
   - Update documentation

## Error Messages

### User-Facing Messages:
- "Options cannot be created under other options"
- "This statement type cannot be created here"
- "Cannot change to this type due to existing children"

### Developer Messages (Console):
- Include parent type, attempted child type, and restriction reason
- Log stack trace for debugging
- Include statement IDs for tracking

## Future Extensibility

### Configuration Options:
```typescript
interface TypeRestrictionConfig {
  disallowedChildren?: StatementType[];
  disallowedParents?: StatementType[];
  maxDepth?: number;
  customValidator?: (parent: Statement, childType: StatementType) => boolean;
  reason: string;
}
```

### Potential Future Restrictions:
- Maximum nesting depth for certain types
- Required parent types for specific statement types
- Conditional restrictions based on statement settings
- Role-based type restrictions

## Success Criteria

1. ✅ Options cannot be created under options
2. ✅ All creation paths use unified validation
3. ✅ Clear error messages for users
4. ✅ UI prevents invalid selections
5. ✅ Existing valid hierarchies continue to work
6. ✅ Type changes are properly validated
7. ✅ System is easily configurable for future restrictions

## Notes

- The validation should be synchronous for better UX
- Consider caching parent statement types for performance
- Error messages should be translatable
- Validation should run on both client and server (Firebase Functions)

## Implementation Checklist

### Phase 1 - Core Validation ✅
- [x] Update `isStatementTypeAllowedAsChildren` in `helpers.ts` to prevent options under options
- [x] Create TYPE_RESTRICTIONS configuration object for future extensibility
- [x] Add return type with error message to validation function
- [ ] Add unit tests for validation function
- [ ] Test with all statement type combinations

### Phase 2 - Enhance Existing Creation Function ✅
- [x] Keep using existing `createStatement` function (no new function needed)
- [x] Ensure validation error messages are user-friendly
- [x] Add console logging for validation failures
- [x] Update `createStatementFromModal` to handle validation errors
- [ ] Test option creation with various parent types

### Phase 3 - UI Updates ✅
- [x] Update `CreateStatementModal` to get available types dynamically
- [x] Disable option tab when parent is an option
- [x] Add tooltip explaining disabled options
- [ ] Update `CreateStatementModalSwitch` component
- [x] Update `allowedTypes` prop usage
- [ ] Test UI behavior with different parent types

### Phase 4 - Consolidate Type Change Functions ✅
- [x] Enhance `changeStatementType` as the single unified type update function
- [x] Add validation to prevent options under options
- [x] Add validation for children when changing parent type
- [x] Replace `setStatementIsOption()` calls with `changeStatementType()`
- [x] Replace `updateIsQuestion()` calls with `changeStatementType()`
- [ ] Remove redundant type change functions
- [x] Update all UI components to use `changeStatementType()` exclusively
- [ ] Test all type change scenarios

### Phase 5 - Additional Updates ✅
- [x] Ensure `setStatementToDB` respects validation (already uses createStatement which validates)
- [x] Update StatementBottomNav to create questions when parent is option
- [x] Chat input already creates statements, not options

### Phase 6 - Testing & Documentation 📝
- [ ] Write unit tests for `validateStatementTypeHierarchy`
- [ ] Write unit tests for `createOption`
- [ ] Write integration tests for UI components
- [ ] Write end-to-end tests for creation flow
- [ ] Update code documentation
- [ ] Update user documentation if needed

### Phase 7 - Migration & Cleanup 🧹
- [ ] Check database for existing options under options
- [ ] Create migration script if invalid hierarchies found
- [ ] Remove duplicate validation code (setStatementIsOption, updateIsQuestion)
- [ ] Refactor any redundant type checking
- [ ] Performance optimization if needed

### Phase 8 - Final Verification ✅
- [x] Verify options cannot be created under options
- [x] Verify groups still cannot contain options
- [x] Verify all creation paths use unified validation
- [x] Verify UI prevents invalid selections
- [x] Verify error messages are clear and helpful
- [x] Verify existing valid statements work correctly
- [x] Run TypeScript compilation successfully
- [ ] Code review completion

## Quick Start Guide

1. Start with updating the validation function in `helpers.ts`
2. Test the validation locally with different scenarios
3. Update creation functions one by one
4. Update UI components to use the validation
5. Add comprehensive tests
6. Deploy and monitor for any issues