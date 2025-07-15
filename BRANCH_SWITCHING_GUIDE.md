# React Version Branch Switching Guide

This guide helps you easily switch between React 18 and React 19 branches in the Freedi app.

## 🚀 Quick Setup

Run the setup script once:
```bash
./scripts/setup-branch-switching.sh
```

## 📋 Available Commands

### Manual React Version Switching
```bash
# Switch to React 18
npm run switch-to-react18

# Switch to React 19
npm run switch-to-react19

# Check current React version
npm run check-react
```

### Automatic Branch Switching
The git post-checkout hook automatically installs the correct React version when you switch branches:

```bash
# This will automatically detect and install React 18 or 19
git checkout your-react18-branch
git checkout your-react19-branch
```

## 🔄 Workflow Examples

### Switching to React 18 branch:
```bash
git checkout feature/my-feature-react18
# Hook automatically installs React 18 dependencies
npm run dev
```

### Switching to React 19 branch:
```bash
git checkout feature/my-feature-react19
# Hook automatically installs React 19 dependencies
npm run dev
```

### Manual override (if needed):
```bash
# Switch branch without running hooks
git -c core.hooksPath="" checkout feature/my-feature

# Then manually install dependencies
npm run switch-to-react18
# or
npm run switch-to-react19
```

## 🛠️ Troubleshooting

### Clear cache and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### If hooks aren't working:
```bash
# Re-run setup
./scripts/setup-branch-switching.sh

# Or manually configure
git config core.hooksPath .githooks
chmod +x .githooks/post-checkout
```

### Check React version:
```bash
npm run check-react
```

## 📁 Files Created

- `package.json` - Added React switching scripts
- `.githooks/post-checkout` - Automatic version detection
- `.githooks/README.md` - Hook documentation
- `scripts/setup-branch-switching.sh` - Setup script
- `BRANCH_SWITCHING_GUIDE.md` - This guide

## 🎯 Best Practices

1. **Always commit your changes** before switching branches
2. **Use descriptive branch names** that indicate React version
3. **Run tests** after switching: `npm run check-all`
4. **Clear build cache** if you encounter issues: `rm -rf dist`

## 🔍 Branch Naming Conventions

Recommended naming patterns:
- `feature/my-feature-react18`
- `feature/my-feature-react19`
- `bugfix/issue-123-react18`
- `bugfix/issue-123-react19`

## ⚙️ Configuration

The setup configures:
- Git hooks path: `.githooks`
- Automatic dependency installation
- React version detection
- Colorized output for better UX

## 📞 Support

If you encounter issues:
1. Check the console output for error messages
2. Run `npm run check-react` to verify current version
3. Clear node_modules and reinstall if needed
4. Refer to the troubleshooting section above