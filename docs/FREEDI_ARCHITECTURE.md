# Freedi Application Architecture

## Overview
Freedi is a flexible deliberation platform built on a unified statement model where every piece of content inherits from a base Statement type. The architecture follows semantic rules that make logical sense for deliberation and decision-making.

## Core Navigation Flow

```
Login → Main → Statement List → Individual Statement → Child Statements (recursive)
```

## The Unified Statement Model

Every content piece is a Statement. The type (group, question, option, statement) determines:
1. Default UI representation
2. Available actions
3. Evaluation methods
4. **Semantic meaning and logical parent-child relationships**

### Base Statement Properties
```typescript
Statement {
  // Identity
  statementId: string        // Universal identifier
  statementType: 'group' | 'question' | 'option' | 'statement'
  
  // Hierarchy
  parentId: string          // Direct parent
  topParentId: string       // Root of tree
  parents: string[]         // Full ancestry chain
  
  // Content
  statement: string         // Main text
  description?: string      // Additional details
  
  // Metadata
  creatorId: string
  createdAt: number
  lastUpdate: number
  
  // Type-specific settings
  questionSettings?: {...}   // If acting as question
  groupSettings?: {...}      // If acting as group
  optionSettings?: {...}     // If acting as option
  questionnaire?: {...}      // If containing questionnaire
}
```

## Semantic Hierarchy Rules

### What Can Contain What (Logical Rules)

#### Groups Can Contain:
✅ **Questions** - Topics for deliberation  
✅ **Statements** - Chat messages, discussions, announcements  
✅ **Other Groups** - Sub-topics, categories  
❌ **NOT Options** - Options need a question context

#### Questions Can Contain:
✅ **Options** - Possible answers or choices  
✅ **Questions** - Follow-up or clarifying questions  
✅ **Statements** - Discussions, clarifications  
✅ **Groups** - Organizing complex sub-topics

#### Options Can Contain:
✅ **Options** - Properties, specifications, or components of the parent option  
✅ **Questions** - Clarifications or details needed  
✅ **Statements** - Explanations, supporting arguments  
✅ **Groups** - Organizing complex proposals

#### Statements (Chat/Discussion) Can Contain:
✅ **Any type** - Full flexibility for discussion threads

## Understanding Options Under Options: Properties & Attributes

**KEY CONCEPT**: Options under options represent **properties, specifications, or modular components** of the parent option, NOT alternative choices.

### Core Principle
- **Question**: "What should we do?"
- **Option**: "Do X"
- **Sub-options**: "Properties/specifications of X"

## Real-World Examples

### 1. Product Specifications
```
Question: "Which laptop should our team purchase?"
└── Option: "MacBook Pro 16-inch"
    ├── Option: "Processor: M3 Max"
    ├── Option: "Memory: 64GB RAM"
    ├── Option: "Storage: 2TB SSD"
    └── Option: "AppleCare+: 3-year coverage"
```
**Sub-options are**: Specifications that define the exact configuration

### 2. Construction Project Properties
```
Question: "Should we build the new community center?"
└── Option: "Yes, build community center"
    ├── Option: "Size: 15,000 sq ft"
    ├── Option: "Budget: $3.5 million"
    ├── Option: "Timeline: 18 months"
    ├── Option: "Contractor: Local builders only"
    └── Option: "LEED Certification: Gold level"
```
**Sub-options are**: Project parameters and constraints

### 3. Service Package Components
```
Question: "Which internet plan for the office?"
└── Option: "Business Premium Plan"
    ├── Option: "Speed: 1 Gbps symmetric"
    ├── Option: "IP Addresses: 5 static"
    ├── Option: "Support: 24/7 phone support"
    ├── Option: "SLA: 99.9% uptime guarantee"
    └── Option: "Installation: Free professional setup"
```
**Sub-options are**: Service features and guarantees

### 4. Policy Implementation Details
```
Question: "Should we implement flexible work policy?"
└── Option: "Yes, hybrid work model"
    ├── Option: "Minimum office days: 2 per week"
    ├── Option: "Core hours: 10 AM - 3 PM"
    ├── Option: "Eligibility: After 6 months employment"
    ├── Option: "Equipment: Company provides laptop + monitor"
    └── Option: "Review period: Quarterly performance check"
```
**Sub-options are**: Policy rules and conditions

### 5. Event Configuration
```
Question: "Should we host the annual conference?"
└── Option: "Host 2-day conference"
    ├── Option: "Venue: Downtown Convention Center"
    ├── Option: "Capacity: 500 attendees"
    ├── Option: "Catering: Vegetarian/vegan options included"
    ├── Option: "Format: 60% workshops, 40% lectures"
    └── Option: "Recording: All sessions recorded"
```
**Sub-options are**: Event specifications

### 6. Software Feature Properties
```
Question: "Which authentication system to implement?"
└── Option: "Multi-factor authentication"
    ├── Option: "Methods: SMS + Authenticator app"
    ├── Option: "Backup codes: 10 single-use codes"
    ├── Option: "Remember device: 30 days"
    ├── Option: "Enforcement: Required for admin accounts"
    └── Option: "Grace period: 2 weeks for setup"
```
**Sub-options are**: Implementation specifications

## Special Cases for Options Under Options

### 1. Modular Components (Build-Your-Own)
```
Question: "How should we configure the new server?"
└── Option: "Custom build configuration"
    ├── Option: "CPU: Dual Xeon processors"
    ├── Option: "RAM: 256GB ECC"
    ├── Option: "Storage: 4x 2TB NVMe RAID 10"
    ├── Option: "GPU: 2x NVIDIA A100"
    └── Option: "Redundancy: Dual power supplies"
```
**Purpose**: Each sub-option is a component choice that together defines the complete system

### 2. Phased Implementation (Timeline Components)
```
Question: "Should we modernize our IT infrastructure?"
└── Option: "Complete digital transformation"
    ├── Option: "Q1 2024: Cloud migration"
    ├── Option: "Q2 2024: Legacy system decommission"
    ├── Option: "Q3 2024: AI tools integration"
    └── Option: "Q4 2024: Training and optimization"
```
**Purpose**: Sub-options are sequential phases that comprise the complete implementation

### 3. Add-on Enhancements
```
Question: "Which health insurance plan?"
└── Option: "Standard Employee Plan"
    ├── Option: "+ Dental coverage ($50/month)"
    ├── Option: "+ Vision coverage ($25/month)"
    ├── Option: "+ Life insurance ($30/month)"
    └── Option: "+ Disability insurance ($40/month)"
```
**Purpose**: Optional enhancements that modify the base option

## What NOT to Do

### ❌ Wrong: Alternative Choices as Sub-options
```
Question: "Where should we expand?"
└── Option: "Open new office"
    ├── Option: "New York"     // These are alternatives,
    ├── Option: "Los Angeles"  // not properties!
    └── Option: "Chicago"       // Should be sibling options
```

### ✅ Correct: Alternatives as Siblings
```
Question: "Where should we expand?"
├── Option: "New York office"
│   ├── Option: "Size: 50 employees"
│   └── Option: "Budget: $2M/year"
├── Option: "Los Angeles office"
│   ├── Option: "Size: 30 employees"
│   └── Option: "Budget: $1.5M/year"
└── Option: "Chicago office"
    ├── Option: "Size: 40 employees"
    └── Option: "Budget: $1.8M/year"
```

### ❌ Wrong: Mixing Abstraction Levels
```
Option: "Hire new team"
├── Option: "5 developers"      // Team composition
└── Option: "Use LinkedIn"      // Recruitment method - different abstraction!
```

### ✅ Correct: Consistent Properties
```
Option: "Hire new team"
├── Option: "Team size: 5 developers"
├── Option: "Seniority: 2 senior, 3 mid-level"
├── Option: "Timeline: Within 3 months"
└── Option: "Budget: $500k annual salaries"
```

## Complete Real-World Scenario

### Municipal Decision Making
```
Group: "City Budget 2024"
├── Statement: "Mayor's opening remarks on budget priorities"
├── Question: "How should we address housing crisis?"
│   ├── Option: "Build affordable housing complex"
│   │   ├── Option: "Units: 200 apartments"
│   │   ├── Option: "Affordability: 30% below market rate"
│   │   ├── Option: "Location: Downtown district"
│   │   ├── Option: "Developer: Public-private partnership"
│   │   └── Option: "Timeline: Completed by 2026"
│   ├── Option: "Renovation assistance program"
│   │   ├── Option: "Budget: $10M annual"
│   │   ├── Option: "Eligibility: Households <$50k income"
│   │   ├── Option: "Grant size: Up to $25k per home"
│   │   └── Option: "Focus: Energy efficiency upgrades"
│   └── Option: "Rent control legislation"
│       ├── Option: "Cap: 3% annual increase maximum"
│       ├── Option: "Coverage: Buildings with 6+ units"
│       ├── Option: "Exemptions: New construction (10 years)"
│       └── Option: "Enforcement: Dedicated oversight board"
├── Question: "Transportation improvements?"
│   └── Option: "Expand public transit"
│       ├── Option: "New lines: 3 bus rapid transit"
│       ├── Option: "Frequency: 10-minute peak service"
│       ├── Option: "Hours: 5 AM - 2 AM daily"
│       └── Option: "Fare: Free for seniors/students"
└── Group: "Public Safety Initiatives"
    └── Question: "Community policing approach?"
```

## Key Architecture Principles

### 1. Semantic Clarity
- Options under options = properties/specifications
- Options under questions = alternative choices
- Groups organize, questions decide, options specify

### 2. Consistent Abstraction
- Sub-options should be at the same level of detail
- All should relate to configuring the parent option
- Don't mix "what" with "how"

### 3. User Mental Model
- Question: "What should we do?"
- Option: "This specific thing"
- Sub-option: "With these specific properties"

### 4. Progressive Detail
- High-level decision → Specific choice → Detailed specifications
- Natural drill-down for complex decisions

## Benefits of This Architecture

1. **Clear Decision Trees**: Each level has distinct meaning
2. **Natural Organization**: Properties naturally belong to their parent option
3. **Reusable Patterns**: Same structure works across domains
4. **Easy to Understand**: Matches how people think about decisions
5. **Flexible Specifications**: Can define simple or complex options

## Technical Implementation

### Validation Rules
```typescript
function validateOptionChild(parentOption: Statement, childOption: Statement): boolean {
  // Child options should be properties, not alternatives
  // This could be enforced through naming conventions or UI hints
  const propertyPrefixes = ['Size:', 'Budget:', 'Timeline:', 'Feature:', '+'];
  return propertyPrefixes.some(prefix => 
    childOption.statement.startsWith(prefix)
  );
}
```

### UI Guidelines
- Label sub-options as "Properties" or "Specifications"
- Use different icons for property-options vs choice-options
- Group properties by category (technical, financial, timeline)
- Show properties as checklist or configuration panel

## Conclusion

Freedi's architecture uses options under options to represent **properties and specifications**, not alternative choices. This creates a clear hierarchy where questions present decisions, options provide choices, and sub-options define the specific properties of those choices. This semantic clarity makes the system intuitive and powerful for complex decision-making.