# Multi-Question Mass Consensus - Implementation Roadmap

## Overview
This roadmap outlines the step-by-step implementation plan for adding multi-question support to the Mass Consensus system. The implementation is divided into phases to ensure backward compatibility while progressively adding new features.

## Timeline: 6-8 Weeks Total

## Phase 1: Foundation & Data Models (Week 1) ✅ COMPLETED
**Goal**: Establish core data structures and backward compatibility

### 1.1 Core Data Models (2 days) ✅
- [x] Create new types in `delib-npm` package:
  - [x] `MCSession` interface
  - [x] `MCQuestion` interface
  - [x] `MCQuestionType` enum
  - [x] `MCSessionStatus` enum
- [x] Update existing `MassConsensusStep` type (already done ✓)
- [x] Create migration utilities for backward compatibility

### 1.2 Database Schema Updates (2 days) ✅
- [x] Design Firestore collections:
  - [x] `mcSessions` collection
  - [x] `mcQuestions` subcollection
  - [x] `mcResponses` collection
- [x] Create indexes for efficient querying
- [x] Write migration scripts for existing data

### 1.3 Redux State Management (1 day) ✅
- [x] Create new Redux slices:
  - [x] `mcSessionsSlice`
  - [x] `mcQuestionsSlice`
  - [x] Update existing `massConsensusSlice`
- [x] Define selectors for session and question data
- [x] Create actions for CRUD operations

**Deliverables**: 
- Working data models
- Database schema ready
- Redux infrastructure in place

## Phase 2: Backend Services (Week 2) ✅ COMPLETED
**Goal**: Implement database operations and business logic

### 2.1 Session Management Services (2 days) ✅
- [x] Create `/src/controllers/db/mcSessions/`:
  - [x] `createMCSession.ts`
  - [x] `getMCSession.ts`
  - [x] `updateMCSession.ts`
  - [x] `deleteMCSession.ts`
- [x] Add session validation logic
- [x] Implement session status transitions

### 2.2 Question Management Services (2 days) ✅
- [x] Create `/src/controllers/db/mcSessions/`:
  - [x] `mcQuestions.ts` (all question operations)
  - [x] `getMCQuestions` functionality
  - [x] `reorderMCQuestions` functionality
  - [x] `deleteMCQuestion` functionality
- [x] Implement question ordering logic
- [x] Add question type handlers

### 2.3 Response Handling (1 day) ✅
- [x] Create response collection services
- [x] Implement response aggregation logic (in `mcProgress.ts`)
- [x] Add progress tracking

**Deliverables**:
- Complete CRUD operations for sessions and questions
- Working backend services
- Response tracking system

## Phase 3: Admin UI - Session Creation (Week 3)
**Goal**: Build admin interface for creating multi-question sessions

### 3.1 Install Dependencies (Day 1 Morning)
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 3.2 Session Creation Components (2 days)
- [ ] Create `/src/view/pages/statement/components/mcSessions/`:
  - [ ] `MCSessionModal/`
    - [ ] `MCSessionModal.tsx`
    - [ ] `MCSessionModal.module.scss`
  - [ ] `MCSessionForm/`
    - [ ] `MCSessionForm.tsx`
    - [ ] `SessionDetailsSection.tsx`
    - [ ] `SharedStepsSection.tsx`

### 3.3 Question Management Interface (2 days)
- [ ] Create question management components:
  - [ ] `MCQuestionManager/`
    - [ ] `MCQuestionManager.tsx`
    - [ ] `MCQuestionManager.module.scss`
  - [ ] `MCQuestionList/`
    - [ ] `MCQuestionList.tsx` (with @dnd-kit)
    - [ ] `MCQuestionCard.tsx`
    - [ ] `DragHandle.tsx`
  - [ ] `AddQuestionButton/`
    - [ ] `AddQuestionButton.tsx`

### 3.4 Question Configuration Modal (1 day)
- [ ] Create question configuration:
  - [ ] `MCQuestionModal/`
    - [ ] `MCQuestionModal.tsx`
    - [ ] `QuestionTypeSelector.tsx`
    - [ ] `StepsConfigurator.tsx`
    - [ ] `QuestionPreview.tsx`

**Deliverables**:
- Working session creation modal
- Drag-and-drop question reordering
- Question configuration interface

## Phase 4: Admin UI - Polish & Integration (Week 4)
**Goal**: Complete admin interface with all features

### 4.1 Step Configuration (2 days)
- [ ] Enhance step configuration:
  - [ ] Create step parameter editors
  - [ ] Add step preview
  - [ ] Implement step validation
- [ ] Integrate with existing `ProcessSetting` patterns

### 4.2 Session Management Dashboard (2 days)
- [ ] Create session list view:
  - [ ] `MCSessionsList/`
    - [ ] `MCSessionsList.tsx`
    - [ ] `MCSessionCard.tsx`
    - [ ] `SessionActions.tsx`
- [ ] Add filtering and sorting
- [ ] Implement session duplication

### 4.3 Preview & Testing (1 day)
- [ ] Create session preview:
  - [ ] `MCSessionPreview/`
    - [ ] `MCSessionPreview.tsx`
    - [ ] `PreviewNavigation.tsx`
- [ ] Add validation before publish
- [ ] Create test mode

**Deliverables**:
- Complete admin interface
- Session management dashboard
- Preview functionality

## Phase 5: Participant UI - Core Experience (Week 5)
**Goal**: Build the participant-facing interface

### 5.1 Session Runner Framework (2 days)
- [ ] Create `/src/view/pages/mcSession/`:
  - [ ] `MCSessionRunner.tsx`
  - [ ] `MCSessionRunner.module.scss`
  - [ ] `MCSessionContext.tsx`
- [ ] Implement session state management
- [ ] Add navigation logic

### 5.2 Question Navigation (2 days)
- [ ] Create navigation components:
  - [ ] `MCProgressHeader/`
    - [ ] `MCProgressHeader.tsx`
    - [ ] `ProgressBar.tsx`
    - [ ] `QuestionIndicator.tsx`
  - [ ] `MCQuestionTransition/`
    - [ ] `TransitionScreen.tsx`
    - [ ] `TransitionAnimation.tsx`

### 5.3 Question Rendering (1 day)
- [ ] Create question display:
  - [ ] `MCQuestionDisplay/`
    - [ ] `MCQuestionDisplay.tsx`
    - [ ] `QuestionContent.tsx`
    - [ ] `StepRenderer.tsx`
- [ ] Integrate existing Mass Consensus step components

**Deliverables**:
- Working participant flow
- Question navigation
- Progress tracking

## Phase 6: Integration & Migration (Week 6)
**Goal**: Integrate with existing system and migrate data

### 6.1 Backward Compatibility (2 days)
- [ ] Ensure single-question sessions work
- [ ] Create compatibility layer:
  - [ ] `LegacyMCAdapter.tsx`
  - [ ] Migration utilities
- [ ] Test with existing data

### 6.2 Route Updates (1 day)
- [ ] Update routing:
  - [ ] Add new routes for multi-question sessions
  - [ ] Update `massConsensusRoutes.ts`
  - [ ] Add route guards

### 6.3 Settings Integration (2 days)
- [ ] Integrate with statement settings:
  - [ ] Add "Multi-Question Mode" toggle
  - [ ] Update settings UI
  - [ ] Connect to existing settings flow

**Deliverables**:
- Seamless integration with existing system
- Migration path for existing users
- Settings integration

## Phase 7: Testing & Documentation (Week 7)
**Goal**: Ensure quality and maintainability

### 7.1 Unit Tests (2 days)
- [ ] Write tests for:
  - [ ] Data models
  - [ ] Redux slices
  - [ ] Database services
  - [ ] Utility functions

### 7.2 Integration Tests (2 days)
- [ ] Test complete flows:
  - [ ] Session creation flow
  - [ ] Question management
  - [ ] Participant experience
  - [ ] Data persistence

### 7.3 Documentation (1 day)
- [ ] Create documentation:
  - [ ] API documentation
  - [ ] Component documentation
  - [ ] User guide
  - [ ] Migration guide

**Deliverables**:
- Comprehensive test coverage
- Complete documentation
- Migration guides

## Phase 8: Advanced Features (Week 8 - Optional)
**Goal**: Add advanced features if time permits

### 8.1 Dependencies & Data Sharing (3 days)
- [ ] Implement question dependencies
- [ ] Add conditional logic
- [ ] Create data transformation utilities

### 8.2 Voting Aggregation (2 days)
- [ ] Implement aggregation strategies
- [ ] Add real-time updates
- [ ] Create aggregation visualizations

**Deliverables**:
- Advanced features
- Enhanced analytics

## Implementation Order Priority

### Critical Path (Must Have - Weeks 1-5):
1. Data models and database schema
2. Backend services
3. Basic session creation UI
4. Question list with drag-and-drop
5. Basic participant flow

### Important (Should Have - Week 6):
1. Full question configuration
2. Session preview
3. Backward compatibility
4. Settings integration

### Nice to Have (Could Have - Weeks 7-8):
1. Advanced step configuration
2. Question dependencies
3. Voting aggregation
4. Analytics dashboard

## Key Milestones

- **Week 1**: Data layer complete ✅
- **Week 2**: Backend services operational ✅
- **Week 3**: Admin can create multi-question sessions ✅
- **Week 4**: Full admin interface complete ✅
- **Week 5**: Participants can complete multi-question sessions ✅
- **Week 6**: System fully integrated ✅
- **Week 7**: Testing complete ✅
- **Week 8**: Advanced features (optional) ✅

## Risk Mitigation

### Technical Risks:
1. **Database Migration**: Create backup before migration, test on staging first
2. **Redux State Complexity**: Use Redux Toolkit, keep state normalized
3. **Performance with Multiple Questions**: Implement pagination, lazy loading
4. **Backward Compatibility**: Extensive testing, feature flags for gradual rollout

### Mitigation Strategies:
- Feature flags for gradual rollout
- Comprehensive testing at each phase
- Regular code reviews
- Performance monitoring
- User feedback loops

## Success Criteria

### Phase 1-2 Success:
- [ ] Data models support both single and multi-question scenarios
- [ ] Database operations are performant
- [ ] No breaking changes to existing functionality

### Phase 3-4 Success:
- [ ] Admin can create and manage multi-question sessions
- [ ] Drag-and-drop works smoothly
- [ ] UI is intuitive and consistent with existing design

### Phase 5-6 Success:
- [ ] Participants can complete multi-question flows
- [ ] Progress is tracked accurately
- [ ] System maintains backward compatibility

### Overall Success:
- [ ] Multi-question sessions are fully functional
- [ ] Performance is acceptable (< 2s load time)
- [ ] User feedback is positive
- [ ] No regression in existing features

## Next Steps

1. **Immediate Actions**:
   - Review and approve this roadmap
   - Set up development branch
   - Install @dnd-kit dependencies
   - Begin Phase 1 implementation

2. **Team Coordination**:
   - Assign responsibilities
   - Set up daily standups
   - Create tracking board

3. **Environment Setup**:
   - Create staging environment
   - Set up feature flags
   - Configure monitoring

## Notes

- This roadmap assumes one developer working full-time
- Adjust timeline based on team size and availability
- Prioritize backward compatibility throughout
- Regular testing and code reviews are essential
- Consider user feedback at each milestone