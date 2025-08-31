# Firebase Project Setup Guide

This guide will help you set up your own Firebase project for Freedi development.

## 🚀 Quick Setup (Recommended)

We've created an automated setup script that will guide you through the entire process:

```bash
# Clone the repository
git clone https://github.com/delib-org/Freedi-app.git
cd Freedi-app

# Run the automated setup
npm run setup:all
```

This will:
1. Check prerequisites
2. Help you create a new Firebase project
3. Guide you through enabling required services
4. Create all configuration files
5. Install all dependencies

## 📋 Manual Setup

If you prefer to set up manually or the automated setup fails, follow these steps:

### Prerequisites

- Node.js 18+ and npm
- Firebase CLI: `npm install -g firebase-tools`
- Git

### Step 1: Create Firebase Project

```bash
# Login to Firebase
firebase login

# Create a new project (choose a unique project ID)
firebase projects:create your-project-id

# Set as active project
firebase use your-project-id
```

### Step 2: Enable Firebase Services

Visit your Firebase Console: `https://console.firebase.google.com/project/your-project-id`

Enable these services:

1. **Authentication**
   - Go to Authentication → Sign-in method
   - Enable Email/Password
   - Enable Google (recommended)

2. **Firestore Database**
   - Go to Firestore Database → Create database
   - Choose "Start in test mode"
   - Select your preferred location

3. **Storage**
   - Go to Storage → Get started
   - Choose "Start in test mode"

4. **Functions** (optional, requires Blaze plan)
   - Go to Functions → Get started
   - Follow the upgrade prompts if needed

### Step 3: Get Firebase Configuration

1. In Firebase Console, go to ⚙️ Project Settings → General
2. Scroll to "Your apps" section
3. Click "Add app" → Web app (</> icon)
4. Register app with any nickname (e.g., "Freedi Dev")
5. Copy the configuration values

### Step 4: Create Configuration Files

#### Create `.env.development`:

```bash
# Copy the template
cp .env.example .env.development

# Edit with your values
nano .env.development  # or use your preferred editor
```

Replace the placeholder values with your Firebase config.

#### Create Firebase config files:

```bash
# Copy templates
cp firebase-config-templates/firebase.json.template firebase.json
cp firebase-config-templates/.firebaserc.template .firebaserc

# Update .firebaserc with your project ID
sed -i '' 's/YOUR_PROJECT_ID/your-project-id/g' .firebaserc  # macOS
# OR
sed -i 's/YOUR_PROJECT_ID/your-project-id/g' .firebaserc     # Linux
```

### Step 5: Install Dependencies

```bash
# Install root dependencies
npm install

# Install functions dependencies
cd functions && npm install && cd ..
```

### Step 6: Start Development

```bash
npm run dev:all
```

Your app will be available at:
- App: http://localhost:5173
- Firebase Emulators UI: http://localhost:5002

## 🔧 Troubleshooting

### Port Conflicts

If you get port errors, the Firebase emulators might be using ports that are already taken. Check these ports:
- 5000, 5001, 5002 (Firebase)
- 5173 (Vite)
- 8080 (Firestore)
- 9099 (Auth)
- 9199 (Storage)

### Firebase Login Issues

If `firebase login` doesn't work:
```bash
firebase login --reauth
```

### Java Not Found

Firebase emulators require Java. Install Java JDK 17+:
- macOS: `brew install openjdk@17`
- Ubuntu: `sudo apt install openjdk-17-jdk`
- Windows: Download from [Oracle](https://www.oracle.com/java/technologies/downloads/)

### Permission Errors

If you get permission errors creating the Firebase project:
1. Make sure you're logged into the correct Google account
2. Try creating the project directly in the [Firebase Console](https://console.firebase.google.com)

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Freedi Wiki](https://github.com/delib-org/delib-5/wiki)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

## 🤝 Getting Help

If you encounter issues:
1. Check the troubleshooting section above
2. Search existing [GitHub Issues](https://github.com/delib-org/Freedi-app/issues)
3. Create a new issue with details about your problem

## 🔒 Security Best Practices

When setting up your Firebase project:

### Development Environment
- Use Firebase emulators for all local development
- Never use production data in development
- Keep your Firebase config in environment variables
- Use `.env.development` for local configs (never commit this file)

### Firebase Security Rules
- Always test security rules before deployment
- Use the Firebase emulator to validate rules
- Follow the principle of least privilege
- Review rules in `firestore.rules` and `storage.rules`

### API Keys
- Firebase config keys are safe to expose (they're protected by security rules)
- Never commit service account keys
- Use environment variables for sensitive data
- Rotate keys regularly

## ⚡ Performance Optimization

### Firebase Configuration
- Enable Firestore offline persistence for better UX
- Use Firebase hosting CDN for static assets
- Configure appropriate cache headers
- Enable compression in Firebase hosting

### Development Tips
- Use compound queries to reduce reads
- Implement proper pagination for large datasets
- Use Firestore bundles for initial data
- Monitor usage in Firebase Console

## 🎯 Next Steps

Once your development environment is running:
1. Read the [Branch Naming Convention](./Branch-naming-convention.md)
2. Check the [Development Guidelines](./CLAUDE.md)
3. Review the [Architecture Documentation](./docs/FREEDI_ARCHITECTURE.md)
4. Explore the codebase and make your first contribution!

Happy coding! 🚀