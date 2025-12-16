# Firebase Functions Architecture

This document provides a comprehensive overview of the Firebase Cloud Functions architecture for Freedi.

## Overview

The Freedi functions layer is a **serverless backend** built on Firebase Cloud Functions (2nd generation). It provides 50+ functions handling data processing, AI operations, notifications, and background tasks.

## Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20 |
| Framework | Firebase Functions v2 |
| Database | Firebase Firestore |
| AI | Google Gemini API |
| Email | SendGrid |
| Language | TypeScript (strict) |
| Testing | Jest |
| Validation | Valibot |

## Directory Structure

```
/functions
├── src/
│   ├── index.ts                      # Main entry point & exports
│   ├── db.ts                         # Firestore initialization
│   ├── email-templates.ts            # Email notification templates
│   ├── helpers.ts                    # Utility functions
│   │
│   ├── config/                       # Configuration
│   │   └── gemini.ts                 # AI model configuration
│   │
│   ├── controllers/                  # HTTP request handling
│   │   ├── statementController.ts   # Statement operations
│   │   ├── maintenanceController.ts # Maintenance operations
│   │   └── __tests__/
│   │
│   ├── services/                     # Business logic layer
│   │   ├── ai-service.ts            # Gemini AI operations
│   │   ├── cache-service.ts         # Firestore-based caching
│   │   ├── cached-ai-service.ts     # AI response caching
│   │   ├── statement-service.ts     # Statement database operations
│   │   └── maintenance/
│   │
│   ├── types/                        # TypeScript type definitions
│   ├── utils/                        # Reusable utilities
│   ├── model/                        # Data models & defaults
│   ├── migrations/                   # Database migrations
│   │
│   └── fn_*.ts                       # Cloud Function implementations
│
├── local-packages/
│   └── shared-types/                 # Shared types package
│
├── jest.config.js                    # Jest configuration
├── package.json                      # Dependencies
└── tsconfig.json                     # TypeScript configuration
```

## Function Types

### HTTP Functions (Request/Response)

Exposed as REST endpoints with CORS handling:

```typescript
// Pattern
export const myFunction = wrapHttpFunction(
  async (req: Request, res: Response) => {
    // Handle request
    res.json({ success: true });
  }
);
```

### Firestore Triggers (Event-Driven)

React to document changes in Firestore:

```typescript
// onCreate
export const onStatementCreated = onDocumentCreated(
  { document: 'statements/{statementId}' },
  async (event) => { /* handle */ }
);

// onUpdate
export const updateEvaluation = onDocumentUpdated(
  { document: 'evaluations/{evaluationId}' },
  async (event) => { /* handle */ }
);

// onDelete
export const onStatementDeletion = onDocumentDeleted(
  { document: 'statements/{statementId}' },
  async (event) => { /* handle */ }
);

// onWrite (create + update)
export const handleWaitingRole = onDocumentWritten(
  { document: 'statementsSubscribe/{subscriptionId}' },
  async (event) => { /* handle */ }
);
```

## Function Catalog

### Statement Operations

| Function | Type | Purpose |
|----------|------|---------|
| `getRandomStatements` | HTTP | Fetch random statements with anchored sampling |
| `getTopStatements` | HTTP | Retrieve top-rated statements |
| `getUserOptions` | HTTP | Get user's personal options |
| `getQuestionOptions` | HTTP | Retrieve options for a question |
| `onStatementCreated` | Trigger | Consolidated creation handler |
| `onStatementDeletion` | Trigger | Clean up on deletion |
| `updateParentOnChildUpdate` | Trigger | Sync parent statement |
| `updateParentOnChildDelete` | Trigger | Update parent on child removal |

### AI & Content Analysis

| Function | Type | Purpose |
|----------|------|---------|
| `checkForSimilarStatements` | HTTP | AI-powered similarity detection |
| `improveSuggestion` | HTTP | Improve statement wording |
| `detectMultipleSuggestions` | HTTP | Split multiple suggestions |
| `checkProfanity` | HTTP | Content moderation |
| `summarizeDescription` | HTTP | AI description generation |

### Mass Consensus (MC)

| Function | Type | Purpose |
|----------|------|---------|
| `massConsensusGetInitialData` | HTTP | Initialize MC session |
| `massConsensusAddMember` | HTTP | Add user to MC |
| `addMemberToMassConsensus` | Trigger | Process member addition |
| `updateOptionInMassConsensus` | Trigger | Update MC options |
| `removeOptionFromMassConsensus` | Trigger | Remove from MC |

### Evaluation & Consensus

| Function | Type | Purpose |
|----------|------|---------|
| `newEvaluation` | Trigger | Handle new evaluations |
| `updateEvaluation` | Trigger | Process evaluation changes |
| `deleteEvaluation` | Trigger | Clean up evaluations |
| `updateAverageEvaluation` | HTTP | Recalculate averages |
| `recalculateEvaluations` | HTTP | Batch recalculation |

### Notifications

| Function | Type | Purpose |
|----------|------|---------|
| `createNotification` | Trigger | Create in-app notifications |
| `sendPushNotification` | Trigger | Send FCM push notifications |
| `addEmailSubscriber` | HTTP | Subscribe to emails |
| `sendEmailToSubscribers` | HTTP | Bulk email sending |
| `unsubscribeEmail` | HTTP | Handle unsubscribe |

### Popper-Hebbian Framework

| Function | Type | Purpose |
|----------|------|---------|
| `analyzeFalsifiability` | Trigger | Analyze claim falsifiability |
| `refineIdea` | Trigger | Improve propositions |
| `onEvidencePostCreate` | Trigger | Score evidence creation |
| `onEvidencePostUpdate` | Trigger | Update evidence scores |
| `onVoteUpdate` | Trigger | Process vote impact |
| `summarizeLink` | Trigger | Analyze evidence links |

### Maintenance

| Function | Type | Purpose |
|----------|------|---------|
| `maintainRole` | HTTP | Update user roles |
| `maintainDeliberativeElement` | HTTP | Migrate element types |
| `maintainStatement` | HTTP | General statement maintenance |
| `maintainSubscriptionToken` | HTTP | FCM token management |

## Architecture Patterns

### Controller-Service Pattern

```
HTTP Request
     │
     ▼
Controller (validation, request handling)
     │
     ▼
Service (business logic, database operations)
     │
     ▼
Firebase Firestore
```

### StatementController Example

```typescript
class StatementController {
  private statementService: StatementService;

  async getUserOptions(req: Request, res: Response): Promise<void> {
    const validator = new RequestValidator()
      .requireString(req.body.questionId, 'questionId')
      .requireString(req.body.userId, 'userId');

    if (!validator.isValid()) {
      res.status(400).json({ error: validator.getErrorMessage() });
      return;
    }

    const options = await this.statementService.getUserOptions(req.body);
    res.json(options);
  }
}
```

### Wrapper Pattern (Error Handling)

```typescript
// HTTP function wrapper
const wrapHttpFunction = (handler: RequestHandler) => {
  return onRequest({ cors: corsConfig }, async (req, res) => {
    const startTime = Date.now();
    try {
      await handler(req, res);
      console.info(`✓ Completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`✗ Error after ${Date.now() - startTime}ms:`, error);
      res.status(500).send("Internal Server Error");
    }
  });
};

// Firestore trigger wrapper
const createFirestoreFunction = <T>(
  path: string,
  triggerType: TriggerType,
  callback: EventCallback<T>,
  functionName: string
) => {
  return onDocumentCreated({ document: path }, async (event) => {
    const startTime = Date.now();
    try {
      await callback(event);
      console.info(`✓ ${functionName} completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`✗ ${functionName} error:`, error);
      throw error; // Re-throw for Firebase retry
    }
  });
};
```

## AI Service Architecture

### Gemini Integration

```typescript
// Singleton model instance
let _generativeModel: GenerativeModel | null = null;

export async function getGenerativeAIModel(): Promise<GenerativeModel> {
  if (!_generativeModel) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    _generativeModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });
  }
  return _generativeModel;
}
```

### AI Functions

| Function | Purpose |
|----------|---------|
| `checkForInappropriateContent()` | Content moderation |
| `findSimilarStatementsByIds()` | Similarity detection |
| `improveSuggestion()` | Statement improvement |
| `generateTitleAndDescription()` | Auto-generate metadata |
| `detectAndSplitMultipleSuggestions()` | Split compound input |
| `detectLanguage()` | Language detection |

### Retry Logic

```typescript
async function getAIResponseAsList(prompt: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = await getGenerativeAIModel();
      const result = await model.generateContent(prompt);
      return parseResponse(result);
    } catch (error) {
      if (!isRetryableError(error) || attempt === maxRetries) {
        notifyAIError('AI request failed', { attempt, error });
        return [];
      }
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await sleep(waitTime);
    }
  }
}

// Retryable: 503, 429, 500, NETWORK_ERROR
```

## Cache Service

### Firestore-Based Caching

```typescript
class FirestoreCacheService {
  private collection = '_cache';

  async get<T>(key: string): Promise<T | null> {
    const doc = await db.collection(this.collection).doc(key).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    if (Date.now() > data.expiresAt) {
      await this.delete(key);
      return null;
    }

    await doc.ref.update({ hitCount: FieldValue.increment(1) });
    return data.value as T;
  }

  async set(key: string, value: unknown, ttlMinutes = 5): Promise<void> {
    await db.collection(this.collection).doc(key).set({
      value,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      createdAt: Date.now(),
      hitCount: 0,
    });
  }

  generateKey(...parts: string[]): string {
    const hash = createHash('md5').update(parts.join('|')).digest('hex');
    return hash.substring(0, 20);
  }
}
```

## Consolidated Triggers

### onStatementCreated (Example)

Single trigger handling multiple tasks in parallel:

```typescript
export const onStatementCreated = onDocumentCreated(
  { document: 'statements/{statementId}' },
  async (event) => {
    const statement = parse(StatementSchema, event.data?.data());

    // Run independent tasks in parallel
    const tasks: Promise<void>[] = [];

    tasks.push(setupAdminsForStatement(statement));
    tasks.push(updateParentForNewChild(statement));
    tasks.push(createNotification(statement));
    tasks.push(addToMassConsensus(statement));
    tasks.push(updateChosenOptions(statement));

    await Promise.all(tasks);
  }
);
```

**Benefits:**
- Fewer triggers = less overhead
- Parallel execution = faster processing
- Single point of error handling

## Data Validation

### Request Validation (Fluent API)

```typescript
class RequestValidator {
  private errors: ValidationError[] = [];

  requireString(value: unknown, fieldName: string): this {
    if (typeof value !== 'string' || !value.trim()) {
      this.errors.push({ field: fieldName, message: 'Required string' });
    }
    return this;
  }

  optionalNumber(value: unknown, fieldName: string, defaultValue: number, max?: number): number {
    if (value === undefined) return defaultValue;
    const num = Number(value);
    if (isNaN(num) || (max && num > max)) {
      this.errors.push({ field: fieldName, message: 'Invalid number' });
      return defaultValue;
    }
    return num;
  }

  isValid(): boolean {
    return this.errors.length === 0;
  }
}
```

### Valibot Schema Validation

```typescript
import { parse } from 'valibot';
import { StatementSchema } from '@freedi/shared-types';

// At function boundary
const statement = parse(StatementSchema, event.data?.data());
// TypeScript now knows exact shape
```

## Collections Used

| Collection | Purpose |
|------------|---------|
| `statements` | Main statement documents |
| `statementsSubscribe` | User subscriptions |
| `evaluations` | User evaluations |
| `userEvaluations` | Aggregated evaluations |
| `massConsensusMembers` | MC membership |
| `choseBy` | Choice tracking |
| `votes` | Vote records |
| `approval` | Approval records |
| `importance` | Importance scores |
| `agrees` | Agreement records |
| `notifications` | In-app notifications |
| `statementViews` | View tracking |
| `_cache` | Cache storage |

## CORS Configuration

```typescript
const corsConfig = process.env.NODE_ENV === 'production'
  ? [
      'https://freedi.tech',
      'https://delib.web.app',
      'https://discuss.freedi.app',
      'https://sign.freedi.app',
    ]
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3001',
      'http://localhost:3002',
    ];
```

## Error Handling

### Error Categories

| Error Type | Handling |
|------------|----------|
| Validation errors | 400 response with details |
| Auth errors | 401/403 response |
| Not found | 404 response |
| AI failures | Retry with backoff, notify |
| Database errors | Log, re-throw for retry |
| Safety blocks | Treat as inappropriate content |

### Error Notification

```typescript
export async function notifyAIError(message: string, context: object): Promise<void> {
  console.error('AI Error:', message, context);
  // Could integrate with Slack, PagerDuty, etc.
}
```

## Testing

### Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

### Test Examples

```typescript
describe('findSimilarStatements', () => {
  it('should reject inappropriate content', async () => {
    jest.spyOn(aiService, 'checkForInappropriateContent')
      .mockResolvedValue({ isInappropriate: true });

    await findSimilarStatements(mockRequest, mockResponse);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });
});
```

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

## Key Design Decisions

1. **Consolidated Triggers**: Single `onStatementCreated` handles multiple tasks
2. **Stateless Functions**: All state in Firestore, enables horizontal scaling
3. **AI Safety First**: Aggressive content moderation with fallbacks
4. **Caching Layer**: Firestore-based caching for expensive operations
5. **Parallel Processing**: Independent tasks run in parallel
6. **TypeScript + Valibot**: Full type safety with runtime validation
7. **Retry Logic**: Exponential backoff for transient failures

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point & exports |
| `src/db.ts` | Firestore initialization |
| `src/services/ai-service.ts` | Gemini AI operations |
| `src/services/cache-service.ts` | Caching layer |
| `src/controllers/statementController.ts` | Statement HTTP handlers |
| `src/utils/validation.ts` | Request validation |
| `src/fn_evaluation.ts` | Consensus calculations |
| `src/fn_statementCreation.ts` | Consolidated creation |
