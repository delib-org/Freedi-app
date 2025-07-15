# Git Hooks for React Version Management

This directory contains git hooks to help manage React version switching between branches.

## Available Hooks

### `post-checkout`
Automatically installs the correct React version dependencies after switching branches.

- **Trigger**: Runs after `git checkout`
- **Function**: Detects React version in package.json and installs matching dependencies
- **Output**: Colorized status messages showing progress

## Setup

The hooks are automatically configured when you run the setup script. To manually configure:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-checkout
```

## How It Works

1. When you run `git checkout <branch>`, the hook triggers
2. It reads the React version from `package.json`
3. Automatically runs `npm install` to update dependencies
4. Shows the current React version for confirmation

## Manual Override

If you need to bypass the automatic installation:

```bash
# Temporarily disable hooks
git -c core.hooksPath="" checkout <branch>

# Re-enable hooks
git config core.hooksPath .githooks
```