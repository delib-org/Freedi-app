# Questionnaire Integration Notes

## Integration with Existing Freedi Architecture

### 1. Statement System Integration

The questionnaire feature integrates with the existing statement system:

- **Questionnaires are Statements**: A questionnaire is a special type of statement with `statementType: 'questionnaire'`
- **Questions are Child Statements**: Each question is a child statement of the questionnaire with `statementType: 'question'`
- **Leverages Existing Infrastructure**: Uses existing permissions, subscriptions, and notification systems

### 2. Data Storage Strategy

#### Collections Used:
1. **statements**: Stores both questionnaires and questions
2. **evaluations**: Stores user responses (similar to how votes are stored)
3. **subscriptions**: Manages who can see/participate in questionnaires

#### Why This Approach:
- Reuses existing security rules and permissions
- Maintains consistency with current data patterns
- Allows questionnaires to appear in groups naturally
- Questions can have their own discussions/sub-statements if needed

### 3. Key Design Decisions

1. **Questions as Statements**:
   - Pros: Reuse existing infrastructure, questions can have sub-discussions
   - Cons: Slightly more complex queries
   - Decision: Worth it for consistency and feature richness

2. **Response Storage**:
   - Store in evaluations collection (similar to votes)
   - One evaluation document per user per questionnaire
   - Contains all question responses

3. **Results Aggregation**:
   - Real-time aggregation for small questionnaires
   - Consider cloud functions for larger datasets
   - Cache results for performance

### 4. User Flow

1. **Creation**:
   - User creates questionnaire from group page
   - Adds questions sequentially
   - Sets questionnaire settings
   - Publishes when ready

2. **Participation**:
   - Users see questionnaire in group
   - Click to start answering
   - Navigate through questions
   - Submit responses

3. **Results**:
   - Creator sees real-time results
   - Participants see results based on settings
   - Export functionality available

### 5. Technical Considerations

1. **Performance**:
   - Lazy load questions (don't fetch all at once)
   - Paginate responses for large questionnaires
   - Use Firestore compound queries efficiently

2. **Security**:
   - Questionnaire inherits group permissions
   - Additional questionnaire-specific permissions
   - Anonymous responses handled separately

3. **Scalability**:
   - Design supports thousands of responses
   - Aggregation strategy for large datasets
   - Consider sharding for very large questionnaires