# Git Branch Naming Convention Guidelines

## Basic Structure

```text
<type>/<short-description>
```

## Branch Types

### Feature Development

- Type: `feature/`
- Purpose: New features and functionality
- Example: `feature/add-google-login`

### Bug Fixes

- Type: `bugfix/`
- Purpose: Non-urgent bug fixes
- Example: `bugfix/fix-payment-calculation`

### Hot Fixes

- Type: `hotfix/`
- Purpose: Urgent production fixes
- Example: `hotfix/patch-security-vulnerability`

### Release Management

- Type: `release/`
- Purpose: Release branches
- Example: `release/2.1.0`

### Code Refactoring

- Type: `refactor/`
- Purpose: Code optimization and restructuring
- Example: `refactor/optimize-search-algorithm`

### Maintenance

- Type: `chore/`
- Purpose: Regular maintenance tasks
- Example: `chore/update-dependencies`

### Infrastructure

- Type: `infra/`
- Purpose: Infrastructure and deployment setup
- Structure: `infra/setup-github-actions`

## Best Practices

### Naming Rules

1. Use lowercase letters
2. Use hyphens (-) to separate words in descriptions
3. Avoid spaces and special characters
4. Keep descriptions concise but meaningful
5. Include ticket numbers when applicable
