# Freedi-app Setup Guide

Freedi-app is a B2C deliberative platform enabling diverse discussion methods to find optimal solutions while minimizing stakeholder impact. See our [project wiki](https://github.com/delib-org/delib-5/wiki) for details.

## Prerequisites

- Node.js and npm
- Java JDK 17+ ([Download](https://www.oracle.com/il-en/java/technologies/downloads/#java21))
- Firebase CLI (`npm install -g firebase-tools`)
- Git
- VS Code (recommended)

## Quick Start

1. Clone and install dependencies:

```bash
git clone https://github.com/delib-org/Freedi-app.git
cd freedi-app
npm install
cd functions && npm install
```

2. Set up Firebase:

3. Configure Firebase project:

- Create project at [Firebase Console](https://console.firebase.google.com/)
-

```bash
firebase login
firebase init emulators
```

- Create `.firebaserc` and `firebase.json` files in the root project
- Set up `.firebaserc` according to template in "firebase-config-files.txt", replace your_project_id with the project id from your new firebase project
- Run `firebase use your_project_id` to select the new project
- Set up your `firebase.json` file by copying the template from "firebase-config-files.txt". You do not have to adjust any attributes

1. Create environment files:
   `.env.development` (`.env.testing` will be provided by the project leader if needed):

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

On functions create

```env
GOOGLE_API_KEY=your-key

BREVO_USER=some user
BREVO_PASSWORD=some password

DOMAIN=localhost
```

## Development

### VS Code Setup

- Open the project using workspace file: `freedi.code-workspace`
- Install recommended extensions when prompted
- This ensures consistent linting rules across the project

### Start local environment

```bash
npm run dev:all
```

#### Access points

- App: `http://localhost:5173`
- Emulators: `http://localhost:5002`

## Git Workflow

Branch naming conventions are documented in `Branch-naming-convention.md`. Please follow these guidelines when creating new branches.

## Troubleshooting

Common issues:

- Firebase emulator requires Java JDK 17+
- Environment variables must match Firebase project settings exactly
- Ensure all dependencies are installed in both root and functions directories
