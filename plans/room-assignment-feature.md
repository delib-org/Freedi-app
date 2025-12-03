# Heterogeneous Room/Table Assignment Feature

## Summary

Enable admins to assign participants to rooms/tables based on demographic diversity. The system scrambles participants to create balanced representation across rooms, ensuring each room has a mix of different demographic groups.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | Firestore (persistent) | Assignments persist across sessions, can be modified |
| Notifications | Push + In-App | Both for maximum reach |
| Missing demographics | Random assignment | Include everyone, don't exclude incomplete profiles |
| Algorithm priority | Balanced representation | Each demographic option equally represented across rooms |
| Algorithm location | Firebase Cloud Function | Security, performance, atomicity |

---

## Feature Overview

### Admin Flow
1. Open statement settings → "Room Assignment" section
2. Set room size (e.g., 6 people per room)
3. Select demographic questions to scramble by (multi-select)
4. See preview: participant count, estimated rooms
5. Click "Create Assignments" → algorithm runs
6. View rooms with participants and their demographic tags
7. Click "Notify Participants" → push + in-app notifications sent

### Participant Flow
1. Receive push notification: "You've been assigned to Room 3"
2. Open statement → see banner: "You are in Room 3"
3. Banner persists until event ends

---

## Phase 1: Data Model (delib-npm)

### Collections (Already added in delib-npm 5.6.75)

```typescript
// Collections enum in delib-npm
export enum Collections {
  // ... existing
  roomsSettings = 'roomsSettings',       // Room assignment configurations
  rooms = 'rooms',                        // Individual rooms
  roomParticipants = 'roomParticipants', // Participant assignments
}
```

---

### TypeScript Interfaces

#### RoomSettings (formerly RoomAssignmentConfig)

```typescript
interface RoomSettings {
  settingsId: string;
  statementId: string;
  topParentId: string;
  roomSize: number;
  scrambleByQuestions: string[];         // Array of userQuestionId
  createdAt: number;
  lastUpdate: number;
  createdBy: { uid: string; displayName?: string };
  status: 'draft' | 'active' | 'archived';
  totalRooms: number;
  totalParticipants: number;
  notificationSent: boolean;
  notificationSentAt?: number;
}
```

#### Room

```typescript
interface Room {
  roomId: string;
  settingsId: string;                    // Reference to RoomSettings
  statementId: string;
  roomNumber: number;                    // 1, 2, 3...
  roomName?: string;
  participants: string[];                // Array of user UIDs
  createdAt: number;
}
```

#### RoomParticipant

```typescript
interface RoomParticipant {
  participantId: string;                 // settingsId--userId
  settingsId: string;                    // Reference to RoomSettings
  statementId: string;
  roomId: string;
  roomNumber: number;
  userId: string;
  userName: string;
  demographicTags: Array<{
    questionId: string;
    questionText: string;
    answer: string;
    color?: string;
  }>;
  assignedAt: number;
  notified: boolean;
}
```

---

### Valibot Schemas

```typescript
import * as v from 'valibot';
import { CreatorSchema } from 'delib-npm'; // Already exists in delib-npm

// Demographic Tag Schema
export const DemographicTagSchema = v.object({
  questionId: v.string(),
  questionText: v.string(),
  answer: v.string(),
  color: v.optional(v.string()),
});

export type DemographicTag = v.InferOutput<typeof DemographicTagSchema>;

// Room Settings Status
export const RoomSettingsStatusSchema = v.picklist(['draft', 'active', 'archived']);

export type RoomSettingsStatus = v.InferOutput<typeof RoomSettingsStatusSchema>;

// Room Settings Schema
export const RoomSettingsSchema = v.object({
  settingsId: v.string(),
  statementId: v.string(),
  topParentId: v.string(),
  roomSize: v.pipe(v.number(), v.minValue(2)),
  scrambleByQuestions: v.array(v.string()),
  createdAt: v.number(),
  lastUpdate: v.number(),
  createdBy: CreatorSchema,
  status: RoomSettingsStatusSchema,
  totalRooms: v.pipe(v.number(), v.minValue(0)),
  totalParticipants: v.pipe(v.number(), v.minValue(0)),
  notificationSent: v.boolean(),
  notificationSentAt: v.optional(v.number()),
});

export type RoomSettings = v.InferOutput<typeof RoomSettingsSchema>;

// Room Schema
export const RoomSchema = v.object({
  roomId: v.string(),
  settingsId: v.string(),
  statementId: v.string(),
  roomNumber: v.pipe(v.number(), v.minValue(1)),
  roomName: v.optional(v.string()),
  participants: v.array(v.string()),
  createdAt: v.number(),
});

export type Room = v.InferOutput<typeof RoomSchema>;

// Room Participant Schema
export const RoomParticipantSchema = v.object({
  participantId: v.string(),
  settingsId: v.string(),
  statementId: v.string(),
  roomId: v.string(),
  roomNumber: v.pipe(v.number(), v.minValue(1)),
  userId: v.string(),
  userName: v.string(),
  demographicTags: v.array(DemographicTagSchema),
  assignedAt: v.number(),
  notified: v.boolean(),
});

export type RoomParticipant = v.InferOutput<typeof RoomParticipantSchema>;
```

---

## Phase 2: Scrambling Algorithm (Cloud Function)

**File:** `functions/src/fn_roomAssignment.ts`

### Algorithm: Stratified Round-Robin with Balanced Representation

```
FUNCTION scrambleIntoRooms(participants, roomSize, questionIds):

    1. SEPARATE complete and incomplete demographic profiles

    2. CALCULATE room count = CEILING(total / roomSize)

    3. GROUP participants by demographic combination
       - Key = answers to selected questions joined (e.g., "male|left")
       - Shuffle each group internally for randomness

    4. INITIALIZE empty rooms array

    5. DISTRIBUTE using round-robin from each group:
       FOR each demographic group:
           FOR each participant in group:
               Find room with fewest participants
               Add participant to that room

    6. ASSIGN incomplete profiles randomly to rooms with space

    7. BALANCE room sizes (no room differs by more than 1)

    8. CALCULATE balance score (0-1, how evenly distributed)

    RETURN rooms, statistics
```

### Edge Case Handling

| Case | Solution |
|------|----------|
| Uneven numbers | Allow rooms to have roomSize-1 members |
| Missing demographics | Assign randomly after balanced assignment |
| Imbalanced demographics (90% male) | Proportional distribution, spread minorities |
| Too few participants | Create single room, return warning |
| Checkbox questions (multi-answer) | Use first selected value as primary |

### Cloud Function Endpoints

```typescript
// POST /createRoomAssignments
interface CreateRequest {
  statementId: string;
  roomSize: number;
  scrambleByQuestions: string[];
  adminId: string;
}

// POST /notifyRoomParticipants
interface NotifyRequest {
  settingsId: string;
}
```

---

## Phase 3: Redux State

**File:** `src/redux/roomAssignment/roomAssignmentSlice.ts`

```typescript
interface RoomAssignmentState {
  settings: RoomSettings[];
  rooms: Room[];
  participants: RoomParticipant[];
  myAssignment: RoomParticipant | null;  // Current user's assignment
  isLoading: boolean;
  error: string | null;
}

// Key Selectors
selectActiveSettingsByStatementId(statementId)
selectRoomsBySettingsId(settingsId)
selectParticipantsBySettingsId(settingsId)
selectMyRoomAssignment(statementId)       // For participant banner
```

---

## Phase 4: Admin UI Components

### Component Structure

```
src/view/pages/statement/components/settings/components/
└── roomAssignment/
    ├── RoomAssignment.tsx                 // Main container
    ├── RoomAssignment.module.scss
    ├── components/
    │   ├── RoomAssignmentConfig.tsx       // Config form (size, questions)
    │   ├── QuestionSelector.tsx           // Multi-select demographics
    │   ├── RoomsList.tsx                  // Display rooms after creation
    │   ├── RoomCard.tsx                   // Individual room
    │   ├── ParticipantChip.tsx            // User with demographic tags
    │   └── ConfirmReassignModal.tsx       // Confirm before replacing
    └── hooks/
        └── useRoomAssignment.ts           // Data fetching/actions
```

### RoomAssignment.tsx (Main Component)

```tsx
const RoomAssignment: FC<{ statement: Statement }> = ({ statement }) => {
  const [viewMode, setViewMode] = useState<'config' | 'results'>('config');
  const { activeSettings, rooms, participants, hasExisting, createAssignments, notifyParticipants } = useRoomAssignment(statementId);

  // Show results if assignments exist
  useEffect(() => {
    if (activeSettings && rooms.length > 0) setViewMode('results');
  }, [activeSettings, rooms]);

  return (
    <div>
      <SectionTitle title={t('Room Assignment')} />

      {viewMode === 'config' && (
        <RoomAssignmentConfig
          statement={statement}
          onCreateClick={handleCreate}
        />
      )}

      {viewMode === 'results' && (
        <RoomsList
          rooms={rooms}
          participants={participants}
          onNotify={notifyParticipants}
          onReassign={() => setViewMode('config')}
        />
      )}
    </div>
  );
};
```

### QuestionSelector.tsx

Multi-select for demographic questions (only radio/checkbox types):

```tsx
// Filter to selectable questions
const selectableQuestions = questions.filter(
  q => q.type === 'radio' || q.type === 'checkbox'
);

// Show each with checkbox, question text, option count
// Display warning if no questions available
```

### RoomCard.tsx

```tsx
// Expandable card showing:
// - Room number/name
// - Participant count
// - On expand: list of participants with demographic tags
```

---

## Phase 5: Participant UI

### RoomAssignmentBanner Component

**File:** `src/view/components/roomAssignment/RoomAssignmentBanner.tsx`

```tsx
const RoomAssignmentBanner: FC<{ statementId: string }> = ({ statementId }) => {
  const myAssignment = useSelector(selectMyRoomAssignment(statementId));

  if (!myAssignment) return null;

  return (
    <div className={styles.banner}>
      <RoomIcon />
      <span>{t('You are in Room {{number}}', { number: myAssignment.roomNumber })}</span>
    </div>
  );
};
```

### Integration Point

Add to statement view (in `StatementContent.tsx` or similar):

```tsx
<RoomAssignmentBanner statementId={statementId} />
```

### Query for Participant's Room

Efficient O(1) lookup using composite document ID:

```typescript
// Document ID: {settingsId}--{userId}
const assignmentRef = doc(DB, 'roomParticipants', `${settingsId}--${userId}`);
```

---

## Phase 6: Notifications

### Cloud Function: notifyRoomParticipants

```typescript
async function notifyRoomParticipants(settingsId: string) {
  // 1. Get all participants for this settings
  const participants = await db.collection('roomParticipants')
    .where('settingsId', '==', settingsId)
    .where('notified', '==', false)
    .get();

  const batch = db.batch();

  // 2. Create in-app notifications
  for (const doc of participants.docs) {
    const p = doc.data();
    batch.set(db.collection('inAppNotifications').doc(), {
      userId: p.userId,
      type: 'room_assignment',
      title: 'Room Assignment',
      message: `You have been assigned to Room ${p.roomNumber}`,
      statementId: p.statementId,
      read: false,
      createdAt: Date.now(),
    });
    batch.update(doc.ref, { notified: true });
  }

  // 3. Update settings
  batch.update(settingsRef, { notificationSent: true, notificationSentAt: Date.now() });

  await batch.commit();

  // 4. Send push notifications via FCM
  await sendPushNotificationsForRooms(participants);
}
```

### Push Notification Content

```typescript
{
  title: "Room Assignment Ready!",
  body: "You've been assigned to Room 3. Tap to view.",
  data: {
    statementId,
    roomNumber: "3",
    type: "room_assignment"
  }
}
```

---

## Phase 7: Firestore Security Rules

```
match /roomsSettings/{settingsId} {
  allow read: if isStatementMember(resource.data.statementId);
  allow write: if isStatementAdmin(resource.data.statementId);
}

match /rooms/{roomId} {
  allow read: if isStatementMember(resource.data.statementId);
  allow write: if isStatementAdmin(resource.data.statementId);
}

match /roomParticipants/{participantId} {
  // Can read own assignment or if admin
  allow read: if request.auth.uid == resource.data.userId
              || isStatementAdmin(resource.data.statementId);
  allow write: if isStatementAdmin(resource.data.statementId);
}
```

---

## Phase 8: Firestore Indexes

```json
{
  "collectionGroup": "roomParticipants",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "settingsId", "order": "ASCENDING" },
    { "fieldPath": "notified", "order": "ASCENDING" }
  ]
}

{
  "collectionGroup": "roomsSettings",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "statementId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" }
  ]
}
```

---

## Critical Files for Implementation

| File | Purpose |
|------|---------|
| `delib-npm` | Collections already added in 5.6.75 (roomsSettings, rooms, roomParticipants) |
| `functions/src/fn_roomAssignment.ts` | NEW: Scrambling algorithm + notify function |
| `functions/src/index.ts` | Register new cloud functions |
| `src/redux/roomAssignment/roomAssignmentSlice.ts` | NEW: Redux state |
| `src/redux/store.ts` | Add roomAssignment reducer |
| `src/controllers/db/roomAssignment/*.ts` | NEW: Firestore operations |
| `src/view/.../settings/components/roomAssignment/*.tsx` | NEW: Admin UI components |
| `src/view/components/roomAssignment/RoomAssignmentBanner.tsx` | NEW: Participant banner |
| `src/view/.../StatementContent.tsx` | Add banner integration |
| `firestore.indexes.json` | Add new indexes |
| `firestore.rules` | Add security rules |

---

## Implementation Order

| Phase | Tasks |
|-------|-------|
| 1 | Valibot schemas + TypeScript types in delib-npm (if not present) |
| 2 | Cloud Function: createRoomAssignments with algorithm |
| 3 | Cloud Function: notifyRoomParticipants |
| 4 | Redux slice + selectors |
| 5 | Firestore controllers (CRUD, listeners) |
| 6 | Admin UI: Config form, QuestionSelector |
| 7 | Admin UI: RoomsList, RoomCard, ParticipantChip |
| 8 | Participant UI: RoomAssignmentBanner |
| 9 | Security rules, indexes |
| 10 | Testing, polish, translations |

---

## Algorithm Performance

For 100-500 participants:
- **Time Complexity**: O(n × m × r) where n=users, m=questions, r=rooms
- **Expected Performance**: < 500ms for 500 users
- **Memory**: O(n) for user data structures

---

## Validation Checklist

- [ ] Algorithm produces balanced rooms (score > 0.7)
- [ ] Edge cases handled (uneven numbers, missing data)
- [ ] Push notifications delivered
- [ ] In-app banner displays correctly
- [ ] Re-assignment confirms before overwriting
- [ ] Participant can only see own room
- [ ] Admin can see all rooms with tags
