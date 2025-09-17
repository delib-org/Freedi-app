# ⚠️ URGENT: Exposed API Keys Security Fix

## Issue
GitHub has detected exposed Google API Keys in your repository:
- File: `...אל_files/analytics.js.הורדה`
- File: `...שראל_files/main(1).js.הורדה`
- Commit: 6a250163

## Immediate Actions Required

### 1. 🔴 ROTATE THE EXPOSED KEYS IMMEDIATELY
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Credentials"
3. Find the exposed API keys
4. Click on each key → "REGENERATE KEY" or delete and create new ones
5. Update your application with the new keys

### 2. 🧹 Clean Git History

#### Option A: If the repository is private and you can force push:
```bash
# Install BFG Repo-Cleaner
brew install bfg  # On Mac
# Or download from: https://rtyley.github.io/bfg-repo-cleaner/

# Clean sensitive files
bfg --delete-files "*.הורדה" --no-blob-protection
bfg --replace-text <(echo "AIzaSy*==>REMOVED") --no-blob-protection

# Clean git history
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push to all branches
git push --force --all
git push --force --tags
```

#### Option B: If you cannot force push:
```bash
# Create a commit that removes the files
find . -name "*.הורדה" -delete
git add -A
git commit -m "Security: Remove files with exposed API keys"
git push
```

### 3. 📝 Update .gitignore
Add these patterns to prevent future issues:

```gitignore
# Downloaded files
*.הורדה
*הורדה*
*.download
*.tmp

# API Keys and secrets
**/config.js
**/firebase-config.js
**/*credentials*
**/*secret*
**/*apikey*
*.env*
!.env.example

# Analytics files that might contain keys
**/analytics.js
**/gtag.js
**/google-analytics.js
```

### 4. 🔍 Audit for Other Exposed Secrets
```bash
# Search for potential API keys
grep -r "AIzaSy" . --include="*.js" --include="*.ts" --exclude-dir=node_modules
grep -r "api_key" . --include="*.js" --include="*.ts" --exclude-dir=node_modules
grep -r "apiKey" . --include="*.js" --include="*.ts" --exclude-dir=node_modules

# Use git-secrets tool
brew install git-secrets  # On Mac
git secrets --install
git secrets --register-aws
git secrets --scan
```

### 5. 🛡️ Prevent Future Exposures

#### Set up pre-commit hooks:
```bash
# Install pre-commit
pip install pre-commit

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
EOF

# Install the git hook scripts
pre-commit install

# Create baseline
detect-secrets scan > .secrets.baseline
```

#### Use environment variables:
Never hardcode API keys. Always use:
```javascript
// Bad ❌
const API_KEY = "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz";

// Good ✅
const API_KEY = process.env.FIREBASE_API_KEY;
```

### 6. 📱 Firebase Specific Security

#### Restrict API Key usage:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to "APIs & Services" → "Credentials"
4. Click on each API key
5. Under "Application restrictions":
   - Choose "HTTP referrers"
   - Add your domains:
     - `https://freedi.tech/*`
     - `http://localhost:5173/*`
6. Under "API restrictions":
   - Select "Restrict key"
   - Choose only the APIs your app needs

#### Use Firebase App Check:
```javascript
// Enable App Check for additional security
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('your-recaptcha-site-key'),
  isTokenAutoRefreshEnabled: true
});
```

## Verification Checklist

- [ ] All exposed API keys have been rotated/regenerated
- [ ] Git history has been cleaned (if possible)
- [ ] .gitignore has been updated
- [ ] No API keys remain in the codebase
- [ ] Pre-commit hooks are installed
- [ ] API keys are restricted in Google Cloud Console
- [ ] Environment variables are being used for all secrets
- [ ] Team has been notified of the security issue

## Prevention Tips

1. **Never commit downloaded files** from browsers (*.הורדה files)
2. **Always use .env files** for API keys
3. **Add .env to .gitignore** immediately
4. **Use secret scanning** tools in CI/CD
5. **Review commits** before pushing
6. **Use GitHub Secret Scanning** alerts

## If Keys Were Used Maliciously

Check for unauthorized usage:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Metrics"
3. Check for unusual API usage patterns
4. Review billing for unexpected charges
5. Contact Google Cloud Support if you see unauthorized usage

## Resources

- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [Google Cloud API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [git-filter-branch](https://git-scm.com/docs/git-filter-branch)

## Contact

If you need help with any of these steps, contact your security team or repository admin immediately.

**Time is critical - exposed API keys can be exploited within minutes!**