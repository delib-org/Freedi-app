# Freedi App

A modern deliberative democracy platform that empowers communities to engage in structured discussions and collective decision-making.

## 🚀 What is Freedi App?

Freedi App transforms how groups make decisions together. Unlike traditional forums or chat apps, it guides communities through structured deliberative processes where every voice is heard and decisions are reached through evidence-based discussion rather than simple majority voting.

### How It Works

1. **📝 Submit Ideas & Proposals** - Community members share problems, solutions, or topics for discussion
2. **💭 Structured Discussion** - Participants engage in organized conversations with clear rules and moderation
3. **📊 Evidence-Based Evaluation** - Ideas are analyzed, compared, and refined through collaborative input
4. **🗳️ Consensus Building** - Multiple voting mechanisms help identify the best solutions that work for everyone
5. **✅ Decision Implementation** - Clear outcomes with community buy-in and action plans

### What Makes It Different?

- **Quality over Quantity**: Focus on thoughtful discussion rather than quick reactions
- **Inclusive Process**: Ensures minority voices are heard, not just the loudest opinions
- **Evidence-Based**: Decisions are backed by research, data, and collaborative analysis
- **Transparent Governance**: Clear rules, open processes, and accountable moderation
- **Real Outcomes**: Designed to reach actual decisions, not endless debates

### Perfect For

- **Community Organizations** deciding on local initiatives or resource allocation
- **Educational Institutions** involving students and faculty in policy decisions
- **Local Governments** engaging citizens in participatory budgeting or urban planning
- **Nonprofits** making strategic decisions with stakeholder input
- **Any Group** that wants to move beyond simple polls to thoughtful collective decision-making

### Real-World Example

> _A neighborhood wants to improve their local park. Instead of heated town halls, they use Freedi App to: collect improvement ideas, discuss pros/cons of each option, evaluate costs and benefits together, and reach consensus on a plan that addresses everyone's top concerns._

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Firebase Functions (Node.js)
- **Database**: Firestore
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting
- **Real-time**: Firebase Realtime Database

## 📋 Features

- Real-time collaborative discussions
- Multiple voting and consensus mechanisms
- User authentication and role management
- Mobile-responsive design
- Offline support with service workers
- Push notifications
- Moderation tools

---

## 🏃‍♂️ Quick Start Guide

> **New to the project?** Follow this guide to get Freedi App running on your local machine.

For more details, see our [project wiki](https://github.com/delib-org/delib-5/wiki).

## ⚡ Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher) and **npm** - [Download here](https://nodejs.org/)
- **Java JDK 17+** (required for Firebase emulators) - [Download here](https://www.oracle.com/il-en/java/technologies/downloads/#java21)
- **Firebase CLI** - Install with: `npm install -g firebase-tools`
- **Git** - [Download here](https://git-scm.com/)
- **VS Code** (recommended) - [Download here](https://code.visualstudio.com/)

## 🔧 Installation

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/delib-org/Freedi-app.git
cd Freedi-app
npm install
cd functions && npm install && cd ..
```

### Step 2: Set up Firebase Authentication

First, log in to Firebase and initialize the emulators:

```bash
firebase login
firebase init emulators
```

### Step 3: Configure Firebase Project

1. **Create a new Firebase project:**

    - Go to [Firebase Console](https://console.firebase.google.com/)
    - Click "Add project" and follow the setup wizard
    - Enable Authentication, Firestore, and Hosting

2. **Set up project configuration files:**
    - Create `.firebaserc` file in the root directory
    - Copy the template from `firebase-config-files.txt` and replace `your_project_id` with your actual Firebase project ID
    - Run: `firebase use your_project_id`
    - Set up your `firebase.json` file by copying the template from `firebase-config-files.txt`

### Step 4: Create Environment Files

Create `.env.development` in the root directory:

```env
VITE_FIREBASE_API_KEY=__YOUR_CONFIG__
VITE_FIREBASE_AUTH_DOMAIN=__YOUR_CONFIG__
VITE_FIREBASE_DATABASE_URL=__YOUR_CONFIG__
VITE_FIREBASE_PROJECT_ID=__YOUR_CONFIG__
VITE_FIREBASE_STORAGE_BUCKET=__YOUR_CONFIG__
VITE_FIREBASE_MESSAGING_SENDER_ID=__YOUR_CONFIG__
VITE_FIREBASE_APP_ID=__YOUR_CONFIG__
VITE_FIREBASE_MEASUREMENT_ID=__YOUR_CONFIG__
VITE_FIREBASE_VAPID_KEY=__YOUR_CONFIG__
```

Create `.env` file in the `functions/` directory:

```env
GOOGLE_API_KEY=your-google-api-key
BREVO_USER=your-brevo-user
BREVO_PASSWORD=your-brevo-password
DOMAIN=localhost
```

> **Note:** Get your Firebase configuration values from your Firebase project settings. For production deployment, you'll need actual API keys.

## 🏃‍♂️ Running the Application

### Step 5: Start the Development Environment

Start all services with a single command:

```bash
npm run dev:all
```

This will start:

- **Frontend development server** on `http://localhost:5173`
- **Firebase emulators** (accessible at `http://localhost:5002`)
- **Firebase Functions** for backend API

### Access Points

- 🌐 **Main App**: `http://localhost:5173`
- 🔧 **Firebase Emulator Suite**: `http://localhost:5002`
- 📊 **Firestore Emulator**: `http://localhost:5002/firestore`
- 🔐 **Auth Emulator**: `http://localhost:5002/auth`

---

## 💻 Development

### VS Code Recommended Setup

For the best development experience:

1. **Open the workspace file**: `freediApp.code-workspace`
2. **Install recommended extensions** when prompted
3. This ensures consistent linting, formatting, and debugging across the project

### Available Scripts

```bash
npm run dev          # Start frontend development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run dev:all      # Start all services (frontend + backend)
npm run test         # Run tests
```

## 🌿 Git Workflow

We follow structured branch naming conventions documented in `Branch-naming-convention.md`.

**Example branch names:**

- `feature/user-authentication`
- `bugfix/voting-calculation`
- `hotfix/security-patch`

Please follow these guidelines when contributing to the project.

## 🛠️ Troubleshooting

### Common Issues and Solutions

**🔥 Firebase Emulator Issues:**

- Ensure Java JDK 17+ is installed and in your PATH
- Try restarting the emulators: `firebase emulators:start`

**🔑 Environment Variables:**

- Double-check that your Firebase config values match your project exactly
- Ensure no trailing spaces in your `.env` files

**📦 Dependencies:**

- If you encounter module errors, try: `npm install` in both root and `functions/` directories
- Clear npm cache: `npm cache clean --force`

**🚀 Port Conflicts:**

- If port 5173 is busy, Vite will automatically use the next available port
- Firebase emulators use fixed ports (check `firebase.json`)

### Need Help?

- 📖 Check our [project wiki](https://github.com/delib-org/delib-5/wiki)
- 🐛 Report issues on [GitHub Issues](https://github.com/delib-org/Freedi-app/issues)
- 💬 Join our community discussions

---

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch following our naming conventions
3. Make your changes with proper tests
4. Submit a pull request with a clear description

## 📄 License

This project is licensed under the terms specified in `LICENSE.md`.

---

**Ready to build the future of democratic participation? Let's get started! 🚀**
