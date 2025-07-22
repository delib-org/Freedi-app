# Freedi - Deliberative Democracy Platform

**Freedi** is a comprehensive deliberative democracy platform that transforms how groups make decisions. It provides structured, inclusive, and transparent processes for reaching consensus on complex topics through diverse discussion methods and consensus-building tools.

## 🌟 Key Features

### **Structured Decision-Making**
- **Statement Hierarchy**: Organize discussions into Groups → Questions → Options
- **Mass Consensus Process**: Guided multi-stage consensus building for large groups
- **Democratic Voting**: Multiple voting mechanisms with result aggregation
- **Evaluation Systems**: Multi-criteria assessment and ranking of options

### **Interactive Deliberation Tools**
- **Mind Maps**: Visual representation of discussion structures and connections
- **Agreement Visualization**: Triangular consensus tracking and agreement mapping
- **Real-time Chat**: Contextual messaging within discussion threads
- **Structured Workflows**: Step-by-step guidance through deliberative processes

### **Collaboration Features**
- **Multi-language Support**: Built-in internationalization for global use
- **Role-based Access**: Admin, member, and viewer permissions
- **Invitation System**: Easy participant management and onboarding
- **Notification System**: In-app and push notifications for updates

### **Advanced Capabilities**
- **Similarity Detection**: AI-powered identification of similar statements
- **Image Integration**: Rich media support for enhanced discussions
- **Offline Support**: Progressive web app with offline capabilities
- **Accessibility**: Full screen reader support and accessibility features

## 🚀 Use Cases

- **Community Decision Making**: Local government, neighborhood associations
- **Organizational Deliberation**: Corporate decisions, team consensus building
- **Educational Settings**: Classroom discussions, academic deliberation
- **Policy Development**: Public consultation and policy feedback
- **Event Planning**: Collaborative decision-making for events and activities

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Redux Toolkit, SCSS
- **Backend**: Firebase (Firestore, Functions, Auth, Storage)
- **Deployment**: Firebase Hosting with CI/CD
- **Testing**: Jest, TypeScript strict mode
- **Development**: Vite, ESLint, Prettier

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

## 🧪 Testing

### Frontend Tests
```bash
npm run test
```

### Functions Tests
```bash
cd functions
npm test
# Watch mode
npm run test:watch
# Specific test
npm test -- -t 'test name'
```

### Code Quality
```bash
npm run lint          # Check linting
npm run lint:fix      # Fix linting issues
npm run typecheck     # TypeScript checking
npm run check-all     # Run all checks + build
```

## 📦 Deployment

### Development Environment
```bash
npm run deploy:dev
```

### Production Environment
```bash
npm run deploy:prod
```

### Individual Services
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

## 📄 License

This project is licensed under the terms specified in `LICENSE.md`.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch following naming conventions
3. Make your changes with tests
4. Ensure all checks pass: `npm run check-all`
5. Submit a pull request

---

**Freedi** - Empowering communities through structured deliberation and democratic decision-making.