# Freedi - Open Source Deliberative Democracy Platform

**Freedi** is an open-source platform exploring solutions to democratic participation at scale. As groups grow larger, coordination becomes exponentially more complex, traditionally forcing decision-making into the hands of small groups. Freedi experiments with consensus algorithms and structured deliberation methods to enable broader participation in group decision-making.

## 🎯 Project Goals

Freedi aims to explore how individual freedom and collective cooperation can work together. Based on research into five foundational pillars—Freedom, Partnerships, Navigation, Grace, and Justice—we're building tools to:

- Support both **individual autonomy** and **collective decision-making**
- Give **every participant a voice** while preventing manipulation
- Enable **larger groups** to reach meaningful consensus (our tests with up to 300 participants show promising results)
- Help **diverse perspectives** find common ground through structured dialogue

## 🔬 Current Implementation

### The Consensus Algorithm
We've developed a consensus algorithm that attempts to balance proposal quality with broad participation:
```
Consensus Score = (Average Evaluation) × √(Number of Evaluators)
```
This formula is designed to encourage broad participation while maintaining quality. We're actively researching improvements and welcome feedback from the research community.

### Three-Phase Deliberation Process (Being Tested)
Our current methodology includes:
1. **Research & Analysis**: Small groups explore the problem space
2. **Proposal Generation**: Individuals develop solutions independently
3. **Collaborative Refinement**: Groups work together to improve proposals

## 🌟 What's Available Now

### **Unified Statement Model**
Freedi uses a powerful unified statement model where every piece of content is a "Statement" with semantic types:
- **Groups**: Top-level containers for organizing deliberations
- **Questions**: Discussion topics that prompt proposals and options
- **Options**: Proposed solutions or choices under questions
- **Statements**: Chat messages and discussions within the hierarchy

This hierarchical model enables unlimited nesting depth with full ancestry tracking, allowing complex discussions to maintain clear relationships and context.

### **Core Platform Features**
- **Hierarchical Statement Management**: Create, edit, move, and organize statements with semantic relationships and version tracking
- **Real-time Collaboration**: WebSocket-powered live updates, synchronized voting, and instant notifications across all participants
- **Advanced Group Organization**: Create deliberation groups with sub-topics, role-based access control, and member approval workflows
- **Multi-language Support**: Full internationalization with RTL support and locale-specific formatting
- **Progressive Web App (PWA)**: Install on any device, works offline with IndexedDB caching and smart sync
- **Accessibility Features**: WCAG AA compliance, screen reader compatibility, keyboard navigation, and proper ARIA labels

### **Evaluation & Consensus Systems**
- **Multi-Type Evaluation**: Simple voting, single-like, and enhanced evaluation methods with custom scales
- **Consensus Algorithm**: Proprietary scoring formula `(Average Evaluation) × √(Number of Evaluators)` that balances quality with broad participation
- **Real-time Results**: Live visualization of consensus strength, vote aggregation, and results analytics
- **Polarization Tracking**: Measure group consensus divergence and identify opinion clusters

### **Deliberation Tools**
- **Structured Discussion Formats**: Multi-stage deliberation with drag-and-drop stage ordering and custom configurations
- **Integrated Chat System**: Real-time messaging with threading, notifications, and new message indicators
- **Similar Statement Detection**: Semantic search to find and suggest duplicate proposals, preventing redundancy
- **Popperian Hebbian Evolution**: Evidence-based proposal improvement with version tracking and diff comparison
- **AI-Powered Features**: Gemini API integration for personalized improvement suggestions, pattern recognition, and facilitation support

### **Mind Map Visualization**
- **Interactive Mind Maps**: React Flow-based hierarchical visualization with virtual rendering for large datasets
- **O(n) Optimized Rendering**: Efficient tree building algorithm supporting unlimited statement hierarchies
- **Export Capabilities**: Export mind maps as JSON, SVG, or PNG formats
- **Smooth Interactions**: Zoom, pan, drag-and-drop, and context menus for intuitive navigation

### **Notification System**
- **Push Notifications**: Firebase Cloud Messaging with multi-device support and deep linking
- **In-App Notifications**: Real-time notification dropdown with unread counts and history
- **Email Notifications**: Configurable email alerts with granular notification controls
- **Smart Filtering**: Notification types for chat, suggestions, evaluations, votes, and membership updates

### **Room Assignment & Facilitation**
- **Heterogeneous Room Assignment**: Demographic-based room scrambling for balanced representation
- **Admin Configuration**: Room participant management with dynamic size configuration
- **Participant Notifications**: Automatic notifications when users are assigned to rooms

### **Monorepo Applications**
Freedi is organized as a monorepo with multiple specialized applications:

| Application | Technology | Description |
|-------------|------------|-------------|
| **Main Freedi App** | Vite + React | Core deliberation platform with full feature set |
| **Mass Consensus** | Next.js | Fast-loading anonymous consensus discussion with SSR/ISR |
| **Document Signing** | Next.js | Digital signature collection and multi-party signing workflows |

### **User Management & Permissions**
- **Role-Based Access Control**: Admin, Creator, Member, and Guest roles with fine-grained permissions
- **Member Management**: Invite, approve, reject, and ban members with bulk operations
- **User Profiles**: Avatar upload, display names, and user preferences
- **Authentication**: Firebase Auth with multi-provider support and token management

### **Data Export & Analytics**
- **Full Data Export**: Export statements, evaluations, votes, and decisions in JSON/CSV formats
- **Mind Map Export**: Save visualizations as SVG or PNG images
- **Participation Metrics**: Track engagement patterns, contribution counts, and user activity
- **Decision Quality Indicators**: Measure consensus strength, stability, and agreement levels
- **Group Dynamics Analysis**: Understand interaction patterns and influence distribution

### **Administration & Settings**
- **Statement Configuration**: Configure evaluation methods, voting settings, and result ranges
- **Question Stages**: Define custom multi-stage deliberation processes
- **Group Settings**: Member management, permission configuration, and notification preferences
- **Advanced Settings**: Chose-by tracking, demographic collection, and questionnaire embedding

## 🚧 Features in Development

### **Enhanced Deliberation**
- **Automated Facilitation**: AI-assisted moderation for larger groups
- **Advanced Analytics**: Deeper insights into group dynamics and decision patterns
- **Cross-group Synthesis**: Better tools for combining insights from multiple groups
- **Mobile Optimization**: Improved experience on phones and tablets

### **Research Tools**
- **A/B Testing Framework**: Compare different deliberation methods
- **Data Export APIs**: Enable academic research on deliberation patterns
- **Customizable Algorithms**: Allow researchers to test alternative consensus formulas
- **Integration Tools**: Connect with other deliberation and survey platforms

## 📊 Early Results & Ongoing Research

In our initial tests with groups ranging from 35 to 300 participants, we've observed:
- Consensus scores reaching 165 points in 2.5-hour structured sessions
- Approximately 85% of participants reporting satisfaction with the process
- Higher consensus scores compared to digital-only platforms

**Note**: These are preliminary results from limited testing. We're actively seeking research partners to help validate and improve our methodologies.

## 🚀 Potential Applications

We believe Freedi could be useful for:

- **Community Decision-Making**: Helping neighborhoods and local organizations reach consensus
- **Organizational Planning**: Supporting teams in collaborative strategy development
- **Educational Settings**: Teaching deliberative skills while making group decisions
- **Policy Consultation**: Gathering meaningful public input on proposed policies
- **Conflict Resolution**: Facilitating dialogue between groups with different perspectives

We're eager to work with organizations and researchers to explore these and other applications.

## 🤝 Call for Research Collaboration

As an open-source project, we invite researchers and practitioners to join us in advancing deliberative democracy:

### **How You Can Contribute**
- **Test our methodologies** in different contexts and cultures
- **Improve our algorithms** for better consensus-building
- **Develop new features** for specific deliberative needs
- **Conduct empirical studies** on platform effectiveness
- **Share your findings** to help the entire community learn

### **Research Areas of Interest**
- Scaling deliberation to thousands of participants
- Cross-cultural adaptation of deliberative methods
- AI integration for enhanced facilitation
- Measuring long-term impacts on community cohesion
- Optimizing the balance between efficiency and inclusion

Contact us through GitHub issues or email to discuss collaboration opportunities.

## 💪 Technical Capabilities

### **Performance & Scalability**
- **Automatic Scaling**: Firebase infrastructure scales automatically with user demand
- **Optimized Algorithms**: Efficient consensus calculations even with hundreds of participants
- **Real-time Synchronization**: WebSocket connections for instant updates across all clients
- **Edge Caching**: Global CDN for fast content delivery worldwide

### **Security & Privacy**
- **Authentication**: Secure multi-factor authentication options
- **Data Protection**: End-to-end encryption for sensitive communications
- **Access Control**: Fine-grained permissions at group and statement levels
- **Audit Trails**: Complete logging of all deliberation activities
- **GDPR Compliance**: Privacy-first design with data export/deletion capabilities

### **Developer Experience**
- **Modular Architecture**: Plugin-ready system with reusable utilities and patterns
- **Structured Error Handling**: Comprehensive error handling system with full context logging
- **Code Quality Tools**: Error handling utilities, Firebase helpers, Redux selector factories, application constants
- **Comprehensive Testing**: Unit, integration, and E2E testing infrastructure (95%+ coverage on utilities)
- **Hot Module Replacement**: Instant feedback during development
- **TypeScript Throughout**: Full type safety from frontend to backend (strict mode, no `any` types)
- **Automated Setup**: One-command project initialization
- **Developer Guide**: Detailed architecture documentation in CLAUDE.md

### **Analytics & Insights**
- **Participation Metrics**: Track engagement and contribution patterns
- **Decision Quality Indicators**: Measure consensus strength and stability
- **Group Dynamics Analysis**: Understand interaction patterns and influence
- **Export Capabilities**: Full data export for research and analysis
- **Custom Reporting**: Flexible reporting tools for organizers

## 🛠️ Technology Stack

### **Frontend**
- **Framework**: React 18 with TypeScript (strict mode)
- **State Management**: Redux Toolkit for predictable state updates
- **Styling**: SCSS modules with Atomic Design System and BEM methodology
  - **Atomic Design**: Atoms, molecules, and organisms for scalable component architecture
  - **BEM Naming**: Block Element Modifier convention for maintainable CSS
  - **Design Tokens**: CSS variables for consistent theming
  - **SCSS First**: All styling in SCSS files, React as TypeScript wrappers
- **Build Tool**: Vite with SWC for lightning-fast HMR
- **PWA**: Service workers for offline functionality

### **Backend**
- **Platform**: Firebase suite for scalable infrastructure
- **Database**: Firestore for real-time data synchronization
- **Authentication**: Firebase Auth with multiple provider support
- **Functions**: Serverless Node.js functions for business logic
- **Storage**: Firebase Storage for media and documents

### **Development & Quality**
- **Testing**: Jest, React Testing Library with comprehensive coverage
- **Type Safety**: TypeScript strict mode, no `any` types allowed
- **Code Quality**: ESLint, Prettier with enforced style guidelines
- **Performance**: Code splitting, lazy loading, and optimized bundles
- **CI/CD**: Automated deployment pipelines for dev/test/prod

### **Code Architecture & Utilities**

The codebase includes production-ready utilities and patterns for consistent, maintainable code:

#### **Error Handling System** (`src/utils/errorHandling.ts`)
- Custom error types: `DatabaseError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NetworkError`
- Structured logging with full context: `logError(error, { operation, userId, statementId, metadata })`
- Higher-order functions for automatic error handling: `withErrorHandling()`, `withRetry()`
- User-friendly error messages for better UX
- **Never use generic `console.error()`** - always log with context

#### **Firebase Utilities** (`src/utils/firebaseUtils.ts`)
- Reference factories: `createStatementRef()`, `createEvaluationRef()`, `createSubscriptionRef()`
- Batch operations with automatic 500-item splitting: `executeBatchUpdates()`
- Timestamp utilities for consistent millisecond timestamps: `createTimestamps()`, `updateTimestamp()`
- Eliminates code duplication in Firebase operations

#### **Redux Selector Factories** (`src/redux/utils/selectorFactories.ts`)
- Reusable selector patterns: `createStatementsByParentSelector()`, `createStatementByIdSelector()`
- Common sort functions: `sortByCreatedAt`, `sortByConsensus`, `sortByLastUpdate`
- Automatic memoization for optimal performance
- Reduces selector duplication by ~40%

#### **Application Constants** (`src/constants/common.ts`)
- Named constants for all magic numbers
- Time constants: `TIME.SECOND`, `TIME.HOUR`, `TIME.DAY`, etc.
- Firebase limits: `FIREBASE.BATCH_SIZE`, `FIREBASE.MAX_RETRIES`
- UI constants: `UI.DEBOUNCE_DELAY`, `UI.ANIMATION_DURATION`
- Validation rules: `VALIDATION.MIN_TITLE_LENGTH`, `VALIDATION.MAX_STATEMENT_LENGTH`
- Standardized error/success messages

#### **Architecture Principles**
- **Separation of Concerns**: View → Controllers → Services, with Redux for state
- **Error Handling First**: All errors logged with full context for debugging
- **Type Safety**: Strict TypeScript, no `any` types, import from `delib-npm` package
- **DRY Principle**: Reusable utilities instead of code duplication
- **Test Coverage**: 80%+ coverage required for all utilities and helpers

**See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines and examples.**

## 📱 Platform Support

### **Web Browsers**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

### **Mobile Devices**
- iOS 14+ (Safari)
- Android 8+ (Chrome)
- Progressive Web App support on all platforms

### **Desktop Applications**
- Windows 10/11 (via PWA)
- macOS 10.15+ (via PWA)
- Linux (via PWA)

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Java JDK 17+** ([Download](https://www.oracle.com/java/technologies/downloads/#java21))
- **Firebase CLI**: `npm install -g firebase-tools`
- **Git**
- **VS Code** (recommended)

## 🏗️ Installation

### 🚀 Quick Setup (Recommended)

Use our automated setup script for the fastest onboarding:

```bash
git clone https://github.com/delib-org/Freedi-app.git
cd Freedi-app
npm run setup:all
```

This will guide you through creating your own Firebase project and configuring everything automatically.

### 📋 Manual Setup

For detailed manual setup instructions, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

1. Copy the example environment file:
   ```bash
   cp .env.example .env.development
   ```

2. Fill in your Firebase configuration values in `.env.development`

3. Follow the detailed setup guide in [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)


## 🚀 Development

### Start Development Environment

```bash
npm run dev:all
```

This runs:
- Frontend dev server (`npm run dev`)
- Firebase emulators (`npm run deve`)
- Functions in watch mode (`npm run devf`)

### Access Points

- **App**: http://localhost:5173
- **Firebase Emulators**: http://localhost:5002
- **Functions**: http://localhost:5001

### VS Code Setup

1. Open the workspace file: `freediApp.code-workspace`
2. Install recommended extensions when prompted
3. This ensures consistent linting and formatting

## 🧪 Testing & Quality Assurance

### **Test Coverage**
- **Unit Tests**: Component and function-level testing
- **Integration Tests**: API and database interaction testing
- **E2E Tests**: Full user journey validation
- **Performance Tests**: Load and stress testing capabilities

### **Running Tests**

#### Frontend Tests
```bash
npm run test              # Run all frontend tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
```

#### Backend Function Tests
```bash
cd functions
npm test                  # Run all function tests
npm run test:watch        # Watch mode
npm test -- -t 'test name' # Run specific test
```

### **Code Quality Checks**
```bash
npm run lint              # ESLint validation
npm run lint:fix          # Auto-fix linting issues
npm run typecheck         # TypeScript type checking
npm run check-all         # Complete validation suite (lint + typecheck + test + build)
```

### **Pre-commit Validation**
All code must pass quality checks before committing:
- No TypeScript errors
- ESLint compliance
- All tests passing
- Successful build

## 📦 Deployment

### Unified Deploy Command

The project uses a centralized environment and deployment system. One command handles environment setup, building, and deployment:

```bash
npm run deploy <target> [options]
```

### Available Targets

| Target | Firebase Project | Description |
|--------|-----------------|-------------|
| `dev` | freedi-test | Local development (with emulator) |
| `test` | freedi-test | Testing new features before production |
| `prod` | synthesistalyaron | Current production |
| `wizcol` | wizcol-app | Main production (Wizcol) |

### Quick Commands

```bash
# Test new features before production
npm run deploy test

# Deploy to current production (synthesistalyaron)
npm run deploy prod

# Deploy to main production (Wizcol)
npm run deploy wizcol

# Preview without deploying
npm run deploy wizcol --dry-run
```

### Deployment Options

```bash
# Deploy everything (default)
npm run deploy test

# Deploy only hosting
npm run deploy prod --hosting

# Deploy only functions
npm run deploy test --functions

# Deploy only Firestore/Storage rules
npm run deploy prod --rules

# Skip build step (use existing build)
npm run deploy test --hosting --skip-build
```

### What the Deploy Script Does

1. **Loads environment** - Sets correct Firebase config for target
2. **Selects Firebase project** - Runs `firebase use <target>`
3. **Builds application** - Compiles frontend with correct environment
4. **Builds functions** - Compiles Cloud Functions (if deploying functions)
5. **Deploys to Firebase** - Deploys selected services

### Environment Management

Environments are managed centrally in the `/env` directory:

```
env/
├── .env.dev          # Local development (freedi-test + emulator)
├── .env.test         # Testing new features (freedi-test deployed)
├── .env.prod         # Current production (synthesistalyaron)
├── .env.wizcol       # Main production (wizcol-app)
├── .env.example      # Template for new environments
├── env-loader.js     # Script to sync environments
└── deploy.js         # Unified deploy script
```

#### Switch Environment (without deploying)

```bash
# Switch to development environment
npm run env:dev

# Switch to production environment
npm run env:prod
```

#### Add a New Environment

1. Copy the template:
   ```bash
   cp env/.env.example env/.env.myenv
   ```
2. Fill in your Firebase configuration
3. Add project to `.firebaserc`:
   ```json
   {
     "projects": {
       "myenv": "my-firebase-project"
     }
   }
   ```
4. Deploy:
   ```bash
   npm run deploy myenv
   ```

### Legacy Deploy Commands

Individual service deployments are still available:

```bash
# Deploy only hosting
npm run deploy:h:prod

# Deploy only functions
npm run deploy:f:prod

# Deploy only Firestore rules
npm run deploy:rules:prod
```

## 🔧 Git Workflow

Branch naming conventions are documented in `Branch-naming-convention.md`. Please follow these guidelines:

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

## 🐛 Troubleshooting

### Common Issues

**Firebase Emulator Issues**:
- Ensure Java JDK 17+ is installed
- Check that ports 5000, 5001, 5002, 8080, 9099, 9199 are available

**Environment Variables**:
- Verify all Firebase config values match your project exactly
- Ensure `.env.development` file is in the root directory

**Dependencies**:
- Run `npm install` in both root and `functions` directories
- Clear node_modules if having issues: `npm run clean`

**Build Issues**:
- Check TypeScript errors: `npm run typecheck`
- Verify linting: `npm run lint`
- Ensure all tests pass: `npm run test`

### Getting Help

- Check the [Project Wiki](https://github.com/delib-org/delib-5/wiki) for detailed documentation
- Review `Branch-naming-convention.md` for development guidelines
- Examine `CLAUDE.md` for additional development instructions

## 🎓 Theoretical Foundation

Freedi draws inspiration from multiple fields:
- **Cognitive Science**: How individuals and groups make decisions
- **Deliberative Democracy Theory**: Principles of inclusive participation  
- **Complexity Science**: Understanding coordination challenges at scale
- **Philosophy**: Insights from thinkers like Kant and Popper on knowledge and cooperation

We're working to synthesize these perspectives into practical tools, though much work remains to be done.

## 🔮 Our Vision for the Future

We hope to contribute to a world where:
- More people can meaningfully participate in decisions that affect them
- Diverse perspectives lead to better solutions
- Technology supports rather than replaces human judgment
- Democratic participation becomes more accessible and effective

This is an ambitious goal, and we recognize we're just at the beginning of this journey.

## 📄 License

This project is licensed under the terms specified in `LICENSE.md`.

## 🤝 Contributing

We welcome contributions from developers, researchers, and anyone interested in improving democratic deliberation. See [CONTRIBUTING.md](./CONTRIBUTING.md) for technical details.

### Development Guidelines
- **[Coding Style Guide](./CODING_STYLE_GUIDE.md)** - Comprehensive guide to coding standards and best practices
- **[Application Architecture](./docs/FREEDI_ARCHITECTURE.md)** - Detailed architecture documentation including the unified statement model and semantic hierarchy
- **[Atomic Design System](./ATOMIC-DESIGN-SYSTEM.md)** - Complete guide to SCSS-first atomic design with BEM methodology
- **[Design Guide](./docs/design-guide.md)** - UI/UX design system, component patterns, and visual language
- **[CLAUDE.md](./CLAUDE.md)** - Instructions for AI-assisted development
- **[Branch Naming Convention](./Branch-naming-convention.md)** - Git workflow guidelines

**Key Architecture Components:**
- Error handling utilities (`src/utils/errorHandling.ts`)
- Firebase utilities (`src/utils/firebaseUtils.ts`)
- Redux selector factories (`src/redux/utils/selectorFactories.ts`)
- Application constants (`src/constants/common.ts`)

For research collaborations, please reach out through GitHub issues or discussions.

---

**Freedi** - An open-source experiment in making democratic deliberation more accessible and effective.