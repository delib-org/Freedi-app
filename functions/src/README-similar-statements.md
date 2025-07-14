# Find Similar Statements Module

This module has been refactored into multiple files for better readability and maintainability.

## File Structure

### 📁 `types/statement-types.ts`

Contains all type definitions, interfaces, and enums:

- `Collections` - Database collection names
- `StatementType` - Enum for statement types
- `Statement` - Main statement interface
- `StatementSimple` - Simplified statement format for AI processing
- `FindSimilarStatementsRequest` - Request interface
- `FindSimilarStatementsResponse` - Response interface

### 📁 `services/ai-service.ts`

Handles all AI-related functionality:

- **Model Management**: Singleton pattern for GenerativeModel caching
- **Response Parsing**: JSON extraction and validation from AI responses
- **Core AI Functions**:
    - `findSimilarStatementsAI()` - Finds semantically similar statements
    - `generateSimilar()` - Generates new similar statements
    - `extractAndParseJsonString()` - Utility for parsing AI responses

### 📁 `services/statement-service.ts`

Manages database operations and statement processing:

- **Database Operations**:
    - `getParentStatement()` - Fetches parent statement by ID
    - `getSubStatements()` - Fetches all sub-statements
- **Data Processing**:
    - `getUserStatements()` - Filters statements by creator
    - `convertToSimpleStatements()` - Converts to AI-friendly format
    - `getStatementsFromTexts()` - Maps AI results back to statements
    - `removeDuplicateStatement()` - Handles duplicate removal
- **Business Logic**:
    - `hasReachedMaxStatements()` - Validates user limits

### 📁 `fn_findSimilarStatements.ts` (Main Function)

Contains the main HTTP Cloud Function with clean business logic:

1. **Validation** - Checks parent statement exists
2. **User Limits** - Verifies user hasn't exceeded statement quota
3. **AI Processing** - Finds similar statements or generates new ones
4. **Response Formatting** - Returns appropriate response structure

## Benefits of This Structure

✅ **Single Responsibility Principle** - Each file has one clear purpose  
✅ **Better Testability** - Individual services can be unit tested  
✅ **Improved Readability** - Main function is now ~100 lines vs 345  
✅ **Easier Maintenance** - Changes to AI logic don't affect DB logic  
✅ **Type Safety** - Centralized type definitions prevent inconsistencies  
✅ **Reusability** - Services can be used by other functions

## Usage

```typescript
// Import the main function
import { findSimilarStatements } from './fn_findSimilarStatements';

// Or import individual services for testing/reuse
import { generateSimilar } from './services/ai-service';
import { getParentStatement } from './services/statement-service';
```

## Testing

Each service can now be tested independently:

- Test AI service with mock responses
- Test statement service with mock database
- Test main function with mock services
