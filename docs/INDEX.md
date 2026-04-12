# Freedi Documentation Index

This folder contains all project documentation organized by topic.

---

## Folder Structure

### [`setup/`](./setup/)
Environment, service, and infrastructure setup guides.
- `FIREBASE_SETUP.md` - Firebase project configuration
- `EMAIL_SETUP.md` - Email/Nodemailer setup for feedback
- `OPENAI_EMBEDDINGS_DEPLOYMENT_PLAN.md` - OpenAI embeddings deployment
- `CICD-SETUP.md` - CI/CD pipeline configuration
- `SENTRY_SETUP.md` - Sentry error monitoring setup

### [`guides/`](./guides/)
Developer guides, coding standards, and user-facing docs.
- `CODING_STYLE_GUIDE.md` - Code style & best practices
- `CONTRIBUTING.md` - How to contribute
- `TESTING.md` - Testing guide (Jest, React Testing Library)
- `ATOMIC-DESIGN-SYSTEM.md` - Design system with BEM methodology
- `MONOREPO_GUIDE.md` - Monorepo structure and workflow
- `USER_GUIDE.md` - End-user guide
- `design-guide.md` - Visual design guide (colors, typography, components)
- `participant-personas.md` - User personas and research (.pdf available)

### [`PRIVACY_AND_RESEARCH_POLICY.md`](./PRIVACY_AND_RESEARCH_POLICY.md)
Privacy policy and scientific research data policy covering data collection, consent model, anonymization, retention, and user rights.

### [`security/`](./security/)
Security policies and vulnerability tracking.
- `SECURITY.md` - Security policy & reporting
- `URGENT_SECURITY_FIX.md` - Exposed API keys fix
- `CODE_HAZARDS.md` - Null/undefined access issues

### [`quality/`](./quality/)
Code quality reviews, improvements, and architectural decisions.
- `CODE_QUALITY_REVIEW.md` - Comprehensive code review (Grade: 7.8/10)
- `CODE_QUALITY_IMPROVEMENTS.md` - Implementation tracking
- `ADR-001-code-quality-infrastructure.md` - Architecture Decision Record

### [`performance/`](./performance/)
Performance optimization documentation.
- `performance-comparison.md` - Before/after optimization results
- `optimization-final-results.md` - Final optimization summary
- `server-optimization-guide.md` - Server-side optimization guide
- `server-optimization-results.md` - Deployment verification results

### [`architecture/`](./architecture/)
System design and architectural recommendations.
- `ARCHITECTURE_PHILOSOPHY.md` - Core design principles
- `FREEDI_ARCHITECTURE.md` - Overall system architecture
- `IN_APP_NOTIFICATIONS_ARCHITECTURE.md` - Notifications system design
- `ERROR_HANDLING_ROADMAP.md` - Error handling strategy
- `IMPORT_ORGANIZATION.md` - Import ordering conventions
- `01-critical-issues.md` through `07-developer-experience.md` - Recommendations
- **`functions/`** - Cloud functions architecture

### [`features/`](./features/)
Feature implementations, status, and updates.
- `ENGAGEMENT_SYSTEM.md` - Engagement system overview
- `CONSENSUS_SCORING_UPDATE.md` - New scoring algorithm (Mean - SEM)
- `IMPLEMENTATION_SUMMARY.md` - Mass consensus optimization
- `MASS_CONSENSUS_EXPLANATIONS_IMPLEMENTATION.md` - Explanations feature
- `MINDMAP_COMPLETE_IMPLEMENTATION.md` - Mindmap feature implementation
- `NOTIFICATIONS.md` - Notifications overview
- `current-notifications-status.md` - Current notifications status
- `average-evaluation-implementation.md` - Average evaluation feature
- `freedi-apps-features.md` - Cross-app features overview (.pdf available)
- `repair-plan.md` - Pilot feedback fixes
- `compound-question.md` - Compound question feature
- `confidence-agreement-index.md` - Confidence agreement index
- **`notifications/`** - In-app notifications implementation
- **`direct-link/`** - Direct link feature

### [`bugs/`](./bugs/)
Issue tracking and debugging guides.
- `CASCADE_ISSUE_TRACKER.md` - Cascade function issues
- `MAIN_CARD_UPDATE_VISIBILITY_ISSUE.md` - UI visibility bug

### [`papers/`](./papers/)
Research papers and theoretical foundations.
- `confidence-agreement-paper.md` - Confidence agreement paper (.pdf available)
- `mass-consensus-paper.md` - Mass consensus methodology
- `demographic-heatmap-filtering.md` - Demographic heatmap research
- `popper-hebbian-complete-guide.md` - Popper-Hebbian complete guide
- `popper-hebbian-edit-evidence-ux.md` - Evidence-based editing UX
- `popper-hebbian-edit-mockups.md` - Edit flow mockups
- `realistic_support_paper.md` - Realistic support paper

### [`qa/`](./qa/)
Quality assurance and end-to-end testing.
- `E2E_TESTING.md` - End-to-end testing guide

### [`plans/`](./plans/)
Feature plans and roadmap documents, organized by theme.

#### [`plans/refactoring/`](./plans/refactoring/) — *Read first*
Foundational cleanup and migration work.
1. `architecture-fix-plan.md` - Architecture improvements
2. `refactor-plan.md` - Code refactoring strategy
3. `paragraphs-migration.md` - Paragraphs data migration
4. `paragraphs-to-substatements-migration.md` - Substatements migration

#### [`plans/mass-consensus/`](./plans/mass-consensus/) — *Core product*
Mass consensus app design and production plans.
1. `mass-consensus-redesign-prompt.md` - Original redesign brief
2. `mass-consensus-redesign-REFACTORED.md` - Refactored redesign spec
3. `MASS_CONSENSUS_PRODUCTION_PLAN.md` - Production rollout plan
4. `mass-consensus-ux-improvement-plan.md` - UX improvements
5. `MASS_CONSENSUS_EXPLANATIONS_UX_DESIGN.md` - Explanations UX
6. `remove-old-mc.md` - Legacy MC removal

#### [`plans/ux-engagement/`](./plans/ux-engagement/) — *Engagement layer*
Hooked model and user journey specs (read in order).
1. `hook-model-engagement-plan.md` - Hook model theory
2. `hooked-engagement-system-plan.md` - Engagement system design
3. `hooked-ux-main-flow-apps.md` - Main app UX flow
4. `hooked-ux-sign-mc-apps.md` - Sign & MC app UX flow
5. `initiator-flow-ux-spec.md` - Initiator journey
6. `participant-journey-ux-spec.md` - Participant journey

#### [`plans/features/`](./plans/features/) — *Individual features*
Independent feature plans (read as needed).
- `add-solution-ux-design.md` / `add-solution-todo.md` / `add-solution-with-similar-detection.md` - Add solution flow
- `heat-maps-feature.md` / `demographic-heatmap-filtering-plan.md` - Heat maps & demographics
- `sign-demographics-feature.md` / `sign-app-migration.md` / `sign-style-options-ui-plan.md` - Sign app
- `room-assignment-feature.md` - Room assignment
- `MINDMAP_IMPROVEMENT_PLAN.md` - Mindmap improvements
- `SEMANTIC_SEARCH_IMPLEMENTATION_PLAN.md` - Semantic search
- `SETTINGS_REDESIGN_SPEC.md` / `STATEMENT_SETTINGS_UX_PROPOSAL.md` - Settings redesign
- `Integration.md` - Integration plan
- `look-for-similarties-scaling-up.md` - Similarity detection at scale

#### [`plans/ai-ml/`](./plans/ai-ml/) — *AI & ML*
AI-powered features and evaluation models.
1. `embeddings-based-clustering-plan.md` - Embeddings clustering
2. `popperian-ai-improvement-feature.md` - Popperian AI feature
3. `fair-evaluation.md` - Fair evaluation model

---

## Quick Links

| Need to... | Go to |
|------------|-------|
| Set up development environment | [`setup/`](./setup/) |
| Understand coding standards | [`guides/CODING_STYLE_GUIDE.md`](./guides/CODING_STYLE_GUIDE.md) |
| Learn the design system | [`guides/design-guide.md`](./guides/design-guide.md) |
| Understand privacy & research data | [`PRIVACY_AND_RESEARCH_POLICY.md`](./PRIVACY_AND_RESEARCH_POLICY.md) |
| Report a security issue | [`security/SECURITY.md`](./security/SECURITY.md) |
| Check performance metrics | [`performance/`](./performance/) |
| Review system architecture | [`architecture/`](./architecture/) |
| Find a feature plan | [`plans/`](./plans/) |
| Read research papers | [`papers/`](./papers/) |

---

## Suggested Reading Order for Plans

If you're getting up to speed on the product roadmap, read plans in this order:

1. **Refactoring** → foundational cleanup that unblocks everything else
2. **Mass Consensus** → the core product redesign
3. **UX Engagement** → the engagement layer built on top (hooked model)
4. **Features** → independent features, read as relevant
5. **AI/ML** → forward-looking AI capabilities

---

*Last updated: April 2026*
