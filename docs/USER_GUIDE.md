# WizCol Platform - Complete User Guide

A comprehensive guide to all features and possibilities across the WizCol platform apps.

---

## Table of Contents

- [Platform Overview](#platform-overview)
- [Part 1: Main App (Deliberation Platform)](#part-1-main-app---deliberation-platform)
  - [Getting Started](#getting-started)
  - [Home Dashboard](#home-dashboard)
  - [Creating a New Statement / Question](#creating-a-new-statement--question)
  - [Statement Types](#statement-types)
  - [Participating in Discussions](#participating-in-discussions)
  - [Views & Screens](#views--screens)
  - [Voting & Evaluation](#voting--evaluation)
  - [Special Modes](#special-modes)
  - [User Roles & Permissions](#user-roles--permissions)
  - [Access Control Levels](#access-control-levels)
  - [Admin Settings Panel](#admin-settings-panel)
  - [Profile & Notifications](#profile--notifications)
- [Part 2: Sign App (Document Collaboration)](#part-2-sign-app---document-collaboration)
  - [Overview](#sign-app-overview)
  - [Viewing a Document](#viewing-a-document)
  - [Signing & Rejecting](#signing--rejecting)
  - [Comments](#comments)
  - [Suggestions](#suggestions)
  - [Evaluating Paragraphs](#evaluating-paragraphs)
  - [Heat Map Visualization](#heat-map-visualization)
  - [Accessibility Features](#accessibility-features)
  - [Admin: Dashboard](#admin-dashboard)
  - [Admin: Document Editor](#admin-document-editor)
  - [Admin: Settings](#admin-settings)
  - [Admin: Collaboration Analysis](#admin-collaboration-analysis)
  - [Admin: User Management](#admin-user-management)
  - [Admin: Version Control](#admin-version-control)
  - [Admin: Team & Invitations](#admin-team--invitations)
  - [Admin: Demographics](#admin-demographics)
- [Part 3: Mass Consensus App (Surveys)](#part-3-mass-consensus-app---surveys)
  - [Overview](#mass-consensus-overview)
  - [Participating in a Survey](#participating-in-a-survey)
  - [Evaluation Interfaces](#evaluation-interfaces)
  - [Submitting Solutions](#submitting-solutions)
  - [Viewing Results](#viewing-results)
  - [Admin: Creating a Survey](#admin-creating-a-survey)
  - [Admin: Survey Settings](#admin-survey-settings)
  - [Admin: Managing Surveys](#admin-managing-surveys)
  - [Admin: Demographics & Explanations](#admin-demographics--explanations)
  - [Admin: Results & Export](#admin-results--export)
- [Language Support](#language-support)
- [Accessibility](#accessibility)

---

## Platform Overview

The WizCol platform consists of three interconnected applications designed for collaborative deliberation, document collaboration, and large-scale consensus building:

| App | Purpose | Best For |
|-----|---------|----------|
| **Main App** | Group deliberation and decision-making | Structured discussions, multi-stage questions, room-based breakouts |
| **Sign App** | Document review and signing | Policy reviews, document approval, paragraph-level feedback |
| **Mass Consensus** | Large-scale surveys and consensus | Crowdsourced solutions, quick voting, large audiences |

All three apps share the same Firebase backend and support multiple languages (English, Hebrew, Arabic, Spanish, German, Dutch).

---

# Part 1: Main App - Deliberation Platform

The main app is the core deliberation tool. It enables groups to discuss questions, propose solutions, evaluate options, and reach consensus through structured processes.

## Getting Started

### Logging In

1. Open the app and you'll see the **Start Page**
2. Choose how to sign in:
   - **Google Login** - Full authentication with your Google account
   - **Temporary Name** - Quick anonymous/guest access
3. Select your preferred language
4. You'll be redirected to the Home Dashboard

### Joining a Statement

There are several ways to join a discussion:

- **Direct link** - Someone shares a statement URL with you
- **PIN invitation** - An admin gives you a PIN code to enter
- **Browse** - Find statements from your Home Dashboard
- **QR code** - Scan a shared QR code

---

## Home Dashboard

After logging in, you'll see the Home Dashboard with two tabs:

### Decisions Tab
- Shows all questions/discussions you are involved in
- Each card displays the statement title, current stage, and your role
- Tap any card to enter the discussion

### Groups Tab
- Shows groups/collections of statements you belong to
- Useful for organizing related discussions
- Available when using the "Advanced User" profile setting

---

## Creating a New Statement / Question

Admins and creators can set up new discussions:

1. From the Home Dashboard, tap the **Create** button
2. Choose the type of statement (see Statement Types below)
3. Enter a title and optional description
4. Configure settings (evaluation type, stages, access level)
5. Share the link or PIN with participants

---

## Statement Types

| Type | Description |
|------|-------------|
| **Question** | A deliberation question that participants answer with options/solutions |
| **Option** | A proposed solution or answer to a question |
| **Group** | A collection of related statements |
| **Document** | A document for review (used primarily in Sign App) |
| **Comment** | A chat-style comment in discussion |

### Question Types

| Type | Description |
|------|-------------|
| **Simple** | Single-stage question with direct evaluation |
| **Multi-Stage** | Sequential stages: explanation, suggestion, evaluation, voting |
| **Mass Consensus** | Multi-round consensus building for large groups |
| **Questionnaire** | Survey/form-based collection |

### Question Stages

Multi-stage questions progress through these phases:

1. **Explanation** - Admin explains the topic and context
2. **Suggestion** - Participants propose options/solutions
3. **First Evaluation** - Initial round of evaluating options
4. **Second Evaluation** - Refined evaluation round
5. **Voting** - Final vote on the top options
6. **Finished** - Results are displayed

---

## Participating in Discussions

### Submitting Options/Solutions

1. Navigate to a question
2. Tap the **+** button in the bottom navigation
3. Enter your proposed solution
4. Submit - your option appears in the list

> If **Popper-Hebbian Discussion** is enabled, you'll go through an idea refinement process:
> 1. Submit your initial idea
> 2. Review and refine it through the Idea Refinery modal
> 3. Your improved idea is then submitted

### Evaluating Options

- Browse through other participants' options
- Rate each option based on the configured evaluation type
- Your evaluation scores contribute to the consensus calculation

### Chatting

- Switch to the **Chat View** to discuss freely
- Send messages, reply to threads
- Chat messages can also be evaluated by other participants

---

## Views & Screens

The bottom navigation and views dropdown let you switch between different visualizations:

### Chat View
- Free-form discussion area
- Threaded conversations
- User avatars and names displayed
- Messages can be evaluated (thumbs up/down)

### Options View
- Browse all proposed options/solutions
- See evaluation scores for each option
- Sort and filter options (see Sorting below)

### Agreement Map
- Visual map showing agreement and disagreement patterns
- Clusters of similar opinions are grouped together
- Helps identify where consensus exists

### Collaboration Index (Polarization Index)
- Measures how polarized or united the group is
- Shows collaboration metrics
- Helps facilitators understand group dynamics

### Mind Map
- Tree visualization of the statement hierarchy
- Shows parent-child relationships between statements
- Visual navigation through the discussion structure

### Sorting Options

In the Options view, sort by:
- **Newest** - Most recently created
- **Most Updated** - Most recently modified
- **Agreement Score** - Highest consensus first
- **Random** - Shuffled order
- **Acceptance** - Most accepted first
- **Most Joined** - Options with most members (when option rooms are enabled)

---

## Voting & Evaluation

### Evaluation Types

| Type | Description |
|------|-------------|
| **Suggestions** | Rate options on a scale |
| **Voting** | Cast votes for preferred options |
| **Random Evaluation** | Get assigned random options to evaluate |
| **Top Evaluation** | Evaluate the top-scoring options |

### How Evaluation Works

1. Each option receives a consensus score based on all evaluations
2. Scores are aggregated and displayed as agreement percentages
3. Pro/con balance is shown for each option
4. Results can be viewed in the Agreement Map

---

## Special Modes

### Follow Me

- **Who can use it:** Admins only
- **What it does:** Sets a navigation path that participants can follow
- **How it works:**
  1. Admin activates Follow Me from the header menu
  2. Non-admin participants see a clickable notification link
  3. Clicking the link takes them to the admin's current page
  4. Useful for guided workshops and live demonstrations

### Power Follow Me

- **Who can use it:** Admins only
- **What it does:** Automatically redirects all non-admin participants
- **How it works:**
  1. Admin activates Power Follow Me from the header menu
  2. All non-admin users are **automatically** redirected to the admin's current page
  3. Participants cannot navigate away independently
  4. A toast notification shows "Following Instructor (Auto)"
  5. Ideal for classroom-style instruction

### Room Assignment

- **Who can use it:** Admins only
- **What it does:** Creates breakout rooms and assigns participants
- **Configuration options:**
  - Room size (number of participants per room)
  - Diversity settings (mix different opinion types)
  - Random or strategic assignment
- **How it works:**
  1. Admin configures room settings
  2. System automatically creates rooms and assigns members
  3. Participants are placed into their assigned rooms
  4. Each room operates as an independent discussion space

### Option Joining / Option Rooms

- **What it does:** Allows participants to join specific options and form sub-groups
- **Settings:**
  - Maximum members per option
  - Room size limits
  - Automatic room splitting when limit is reached
  - Diversity settings for mixed rooms

### Clustering / Idea Refinement

- **What it does:** AI-powered grouping of similar suggestions
- **Features:**
  - Automatically groups similar ideas
  - Creates labels/frames for each cluster
  - Helps identify duplicate suggestions
  - Admin can manage, merge, and split clusters

---

## User Roles & Permissions

| Role | Description | Capabilities |
|------|-------------|-------------|
| **Creator** | Created the statement | Full admin access |
| **Admin** | Promoted by creator | Full settings access, member management, Follow Me |
| **Member** | Regular participant | View, suggest, evaluate, vote, chat |
| **Waiting** | Pending approval | Cannot participate until approved (moderated access) |
| **Banned** | Blocked by admin | Cannot participate |
| **Unsubscribed** | Left the statement | No longer receives updates |

### What Admins Can Do (Beyond Members)

- Access the Settings panel
- Activate Follow Me / Power Follow Me
- Invite members with PIN
- Manage members (ban, promote, approve)
- Configure question stages and types
- Set evaluation settings
- Create and manage rooms
- Configure clustering
- Set access control levels
- View hidden/unpublished options (eye toggle)

---

## Access Control Levels

Admins can set the access level for each statement:

| Level | Who Can Join | Authentication Required |
|-------|-------------|----------------------|
| **Open to All** | Anyone, including anonymous users | No |
| **Open for Registered** | Any authenticated user | Yes |
| **Moderated** | Requires admin approval after login | Yes + Approval |
| **Secret** | Invitation only | Yes + Invitation |

---

## Admin Settings Panel

The Settings panel (admin only) contains these sections:

### Basic Settings
- Question title and description
- Statement type selection
- Language selection

### Advanced Settings
- Enable/disable similarity search
- Enable/disable Popper-Hebbian discussion
- Enable/disable pre-check for ideas
- Toggle option creation during suggestions/voting
- Evaluation type selector
- Maximum votes per user
- Option room configuration

### Membership Settings
- Set access level
- View member list with roles
- Ban/unban members
- Promote members to admin
- Approve waiting members

### Room Assignment
- Configure room sizes
- Set diversity parameters
- Trigger automatic assignment
- View created rooms and assignments

### Clustering Admin
- Manage AI-generated clusters
- View and edit framing suggestions
- Merge or split clusters

### Evaluation Settings
- Maximum evaluators
- Evaluation type configuration
- Rating scale setup
- Pro/con balance settings

### Results Range Settings
- Custom result display ranges
- Agreement thresholds
- Visualization configuration

### Email Notifications
- Configure automated email notifications
- Set triggers (voting completion, new evaluations)

---

## Profile & Notifications

### Profile Page (`/my`)
- View and edit your display name
- Upload or change your profile photo
- Set your user type:
  - **Simple User** - Decisions-first home layout
  - **Advanced User** - Groups-first home layout

### Notification Settings
- Check notification status
- Configure push notifications (FCM)
- Run notification diagnostics

---

# Part 2: Sign App - Document Collaboration

## Sign App Overview

The Sign App enables collaborative document review, signing, and improvement. Admins publish documents, and participants can sign, reject, comment, suggest changes, and evaluate individual paragraphs.

---

## Viewing a Document

When you open a document link (`/doc/[statementId]`):

1. The document loads with all its paragraphs (headings, text, lists, images)
2. A **Table of Contents** may appear (sidebar on desktop, hamburger menu on mobile)
3. You'll see **signature progress** (signed/rejected/viewed counts)
4. Each paragraph may have interaction buttons for comments, suggestions, and evaluations

### Navigation
- Scroll through the document
- Use the Table of Contents for quick navigation
- TOC supports configurable depth (h1 through h6)
- Position adjusts automatically for RTL languages

---

## Signing & Rejecting

At the bottom or end of the document:

### Signing
- Click the **Sign** button to record your approval
- Your signature is counted in real-time

### Rejecting
- Click the **Reject** button if you disagree
- A **feedback modal** appears where you can explain your rejection
- Your rejection reason is visible to admins

### Signature States
| State | Meaning |
|-------|---------|
| Signed | User approved the document |
| Rejected | User rejected (with optional feedback) |
| Viewed | User opened but didn't sign or reject |
| Pending | User hasn't interacted yet |

---

## Comments

If comments are enabled by the admin:

1. Click the **Comments** button on any paragraph
2. A modal opens showing existing comments and a text field
3. Write your comment and submit
4. Comment counts are displayed as badges on each paragraph
5. You can **edit** or **delete** your own comments

> If "Hide User Identity" is enabled by the admin, comments appear without names.

---

## Suggestions

If suggestions are enabled by the admin:

### Creating a Suggestion
1. Click the **Suggestions** button on any paragraph
2. Propose alternative text for that paragraph
3. Optionally include reasoning/explanation
4. You can have one active suggestion per paragraph

### Viewing & Voting on Suggestions
- See all suggestions for each paragraph with real-time counts
- **Vote** on suggestions (thumbs up/down)
- Suggestions show a **consensus indicator** (how much agreement they have)
- Sort suggestions by: divergence, approval rating, comment count, or document order

### Suggestion Statuses
| Status | Meaning |
|--------|---------|
| Pending | Below consensus threshold |
| In Progress | Gaining traction |
| Adopted | Consensus reached - ready for admin approval |
| Rejected | Admin rejected the suggestion |

---

## Evaluating Paragraphs

If evaluations are enabled by the admin:

1. Each paragraph shows **approve** (thumbs up) and **reject** (thumbs down) buttons
2. Click to cast your vote; click again to remove it
3. Real-time vote counts are displayed
4. A **consensus score** (-1 to +1) is calculated from all evaluations

---

## Heat Map Visualization

If the heat map is enabled:

The heat map shows engagement and consensus visually across the document:

| View Mode | Shows |
|-----------|-------|
| **Views** | How many people engaged with each paragraph |
| **Support** | Consensus/approval level per paragraph |
| **Importance** | Interaction count per paragraph |

- Color-coded cells show engagement intensity
- Hover for exact counts
- Optional demographic filtering (if demographics are collected)

---

## Accessibility Features

The Sign App includes a comprehensive accessibility toolkit:

- **Accessibility Widget** - Button in the bottom-right corner
- **Text Sizing** - Adjust text size up or down
- **High Contrast Mode** - Enhanced visibility for low-vision users
- **Enhanced Visibility** - Always-visible interaction buttons (useful for elderly users)
- **RTL/LTR Support** - Automatic detection for Arabic/Hebrew
- **Keyboard Navigation** - Full keyboard access
- **Screen Reader Support** - ARIA labels and semantic HTML
- **Heading Numbers** - Hierarchical numbering (1, 1.1, 1.1.1) for easier reference

---

## Admin: Dashboard

The admin dashboard (`/doc/[id]/admin`) provides:

### At a Glance
- Total participants count
- Signed count with percentage
- Rejected count with percentage
- Viewed-only count
- Total comments across all paragraphs
- Average approval score

### Most Engaged Paragraphs
- Table showing paragraphs ranked by engagement
- Metrics: approval rating, comment count, suggestion count

### Quick Actions
- Links to all admin sub-pages (settings, editor, users, etc.)

---

## Admin: Document Editor

The editor (`/admin/editor`) lets you create and modify document content:

### Paragraph Types
| Type | Description |
|------|-------------|
| Heading (h1-h6) | Section headings with configurable levels |
| Paragraph | Standard text content |
| List | Ordered or unordered lists |
| Image | With alt text and captions |
| Blockquote | Quoted text |
| Code Block | Code snippets |

### Editing Features
- **Rich text editing** powered by Tiptap editor
- **Add content** between existing paragraphs
- **Drag to reorder** paragraphs
- **Bulk delete** with select mode
- **Google Docs import** - Import and auto-convert documents
- **Image management** - Upload from file or URL, set alt text, add captions

---

## Admin: Settings

The settings panel (`/admin/settings`) covers:

### Interaction Settings
| Setting | Description |
|---------|-------------|
| Allow Comments | Toggle paragraph-level comments |
| Allow Evaluations | Toggle approve/reject on paragraphs |
| Enable Suggestions | Toggle alternative text proposals |
| Show Heatmap | Toggle heat map visualization |
| Show View Counts | Toggle view statistics |

### Access Control
| Setting | Description |
|---------|-------------|
| Public/Private | Toggle document visibility |
| Require Google Login | Block anonymous access |
| Hide User Identities | Anonymous interactions |
| Show Signature Counts | Display sign/reject numbers |

### Language & Branding
| Setting | Description |
|---------|-------------|
| Default Language | Set the document's primary language |
| Force Language | Override user language preference |
| Text Direction | Auto, LTR, or RTL |
| Logo | Upload custom logo URL |
| Brand Name | Set custom brand name |

### Table of Contents
| Setting | Description |
|---------|-------------|
| Enable TOC | Toggle Table of Contents |
| Max Heading Level | Depth of TOC (1-6) |
| Position | Auto, Left, or Right |

### Accessibility
| Setting | Description |
|---------|-------------|
| Enhanced Visibility | Always show interaction buttons |
| Heading Numbers | Hierarchical numbering |
| Allow Header Reactions | Make headings interactive |

### Advanced
| Setting | Description |
|---------|-------------|
| Explanation Video | YouTube URL for intro video |
| Video Mode | Optional viewing or required before reading |
| Header Colors | Custom colors per heading level |

---

## Admin: Collaboration Analysis

The collaboration dashboard (`/admin/collaboration`) helps analyze suggestion patterns:

### Features
- View collaboration status per paragraph
- Filter by: all, converging, diverging, stable
- Sort by: divergence score, approval, comments, document order

### Per-Paragraph Detail
- Original text vs. suggested alternatives
- Voting statistics per suggestion
- Comment threads
- Suggestion timeline

---

## Admin: User Management

The users panel (`/admin/users`) provides:

### Participant List
- All users with their signature status
- Search by name or email
- Filter by: all, signed, rejected, viewed, pending

### User Details
- Display name and email
- Signature status and date
- Number of approvals and comments
- Rejection reason (if applicable)

### Export Options
| Format | Contents |
|--------|----------|
| Standard CSV | Signatures and basic stats |
| Detailed CSV | All interactions (comments, suggestions, votes) |
| Demographic CSV | Survey responses |
| JSON | Full document data |

---

## Admin: Version Control

The version control system (`/admin/version-control`) manages document evolution:

### Version Control Modes
| Mode | Description |
|------|-------------|
| **Automatic** | Real-time replacements when suggestions exceed consensus threshold |
| **Timer** | Scheduled batch processing of suggestions |
| **Manual** | Admin reviews and approves each change |

### Review Queue
- Pending suggestions awaiting approval
- Accept, reject, or edit before accepting
- View surrounding context for each change
- Document comparison panel (diff view)

### Version History
- Timeline of all document versions
- Compare any two versions
- AI-generated summaries of changes (optional)
- Rollback capability

### Settings
- K1 parameter (importance weight)
- K2 parameter (consensus weight)
- Minimum impact threshold

---

## Admin: Team & Invitations

The team panel (`/admin/team`) manages document access:

### Permission Levels
| Level | Capabilities |
|-------|-------------|
| **Owner** | Full control over the document |
| **Admin** | Edit settings and manage team |
| **Viewer** | Read-only access |
| **Subscriber** | View and interact |

### Invitation System
- Send email invitations with specific permission levels
- Track invitation status (pending, accepted, declined)
- Resend invitations
- Revoke pending invitations
- Remove collaborators

---

## Admin: Demographics

Demographics collection can be configured:

### Survey Modes
| Mode | Description |
|------|-------------|
| Disabled | No demographic collection |
| Inherited | Use parent group's questions |
| Custom | Define questions for this document |

### Trigger Options
- On interaction (when user first engages)
- On signature (when user signs/rejects)
- Manual (user chooses to fill in)

### Question Types
- Text input
- Multiple choice
- Single select

---

# Part 3: Mass Consensus App - Surveys

## Mass Consensus Overview

The Mass Consensus app is designed for large-scale crowdsourced deliberation. Admins create surveys with questions, and participants evaluate proposed solutions using an intuitive swipe or click interface.

---

## Participating in a Survey

### Getting Started
1. Receive a survey link from the organizer
2. Open the link - you'll land on the survey entry page
3. View the welcome/opening slide (if enabled by admin)
4. Begin answering questions

> **No login required** for participants. Your identity is tracked anonymously via a cookie.

### Survey Flow
1. **Welcome** - See the opening slide with intro text and logos
2. **Questions** - For each question:
   - Read the question prompt
   - Evaluate 3-6 proposed solutions
   - Optionally submit your own solution
   - Move to the next question (or skip, if allowed)
3. **Demographics** - Answer demographic questions (if configured)
4. **Explanations** - Read any informational pages between questions
5. **Completion** - See the thank-you page with optional email signup

### Navigation
- **Progress indicator** shows your position in the survey
- **Back button** (if allowed) lets you return to previous questions
- **Skip** (if allowed) lets you move forward without meeting minimum evaluations

---

## Evaluation Interfaces

### Swipe Interface (Default)

The swipe interface presents one solution at a time:

1. A solution card appears in the center
2. **Swipe right** to agree, **swipe left** to disagree
3. The intensity of your swipe determines the rating:
   - Far left: Strongly Disagree (-1)
   - Left: Disagree (-0.5)
   - Center: Neutral (0)
   - Right: Agree (+0.5)
   - Far right: Strongly Agree (+1)
4. Visual color feedback shows your rating zone
5. Confirm your rating or adjust

> **Learning Mode:** The first 3 evaluations show a confirmation dialog to help you learn the interface.

### Classic Interface

The classic interface shows multiple solution cards at once:

1. A grid of 3+ solution cards is displayed
2. Each card has 5 rating buttons below it
3. Click a button to rate immediately
4. Continue rating all visible cards
5. Load more solutions with "Get new batch"

### Rating Scale

| Value | Meaning | Color |
|-------|---------|-------|
| -1 | Strongly Disagree | Red |
| -0.5 | Disagree | Orange |
| 0 | Neutral | Gray |
| +0.5 | Agree | Light Green |
| +1 | Strongly Agree | Green |

---

## Submitting Solutions

During evaluation, you can propose new solutions:

1. A prompt appears periodically encouraging submissions
2. Click **Add Solution** to open the submission form
3. Write your proposed solution (3-500 characters)
4. The system checks for **similar existing solutions**:
   - If a match is found, you can choose to **merge** with it
   - Or add yours as a **new solution**
5. Receive confirmation once submitted

### Suggestion Modes (Set by Admin)
| Mode | Primary Action |
|------|---------------|
| **Encourage** | "Add as New" is the main button |
| **Balanced** | Both "Add New" and "Merge" are equal |
| **Merge-Focused** | "Merge" is primary, extra confirmation for new |

---

## Viewing Results

### Question Results Page
- All solutions sorted by **consensus score** (highest first)
- Each solution shows:
  - Consensus value
  - Number of evaluators
  - Participation rate
- Your own submitted solutions are highlighted
- Results update in real-time (every 30 seconds)

### My Suggestions Page (`/my-suggestions`)
- View all solutions you've submitted across surveys
- See feedback and comments from other evaluators
- Statistics: total suggestions, average score, comment count
- Filter by survey or question

---

## Admin: Creating a Survey

### Step-by-Step

1. **Sign in** with Google at `/login`
2. Navigate to **My Surveys** (`/admin/surveys`)
3. Click **Create New Survey**
4. Fill in:
   - **Title** (required)
   - **Description** (optional)
5. **Add questions:**
   - Select from existing questions
   - Or create new questions on the spot
6. **Configure settings** (see Survey Settings below)
7. **Save** - survey is created in Draft status

---

## Admin: Survey Settings

### Participant Behavior
| Setting | Description | Default |
|---------|-------------|---------|
| Allow Skipping | Skip questions without minimum evaluations | Off |
| Allow Returning | Go back to previous questions | Off |
| Allow Suggestions | Let participants add solutions | On |
| Suggestion Mode | Encourage / Balanced / Merge-Focused | Balanced |
| Display Mode | Swipe or Classic interface | Swipe |
| Min Evaluations | Required evaluations before proceeding | 3 |

### Language
| Setting | Description |
|---------|-------------|
| Default Language | Survey's primary language |
| Force Language | Prevent participant language override |

### Branding
| Setting | Description |
|---------|-------------|
| Opening Slide | Enable/disable welcome screen |
| Logos | Upload and reorder multiple logos with alt text |
| Custom Intro Text | Replace default welcome text |

### Per-Question Overrides
Each question within a survey can override:
- Display mode (swipe/classic)
- Suggestion settings
- Minimum evaluations
- Other evaluation parameters

---

## Admin: Managing Surveys

### Survey Statuses

| Status | Meaning | Participants Can Access |
|--------|---------|----------------------|
| **Draft** | Under construction | No |
| **Active** | Open for responses | Yes |
| **Closed** | No longer accepting responses | View-only |

### Sharing
- Copy the survey link
- Display QR code for easy scanning
- Preview how participants will see the survey

### Test Mode
- Toggle test mode on/off
- When enabled, responses are marked as test data
- Clear test data without affecting real responses
- View separate test data statistics

---

## Admin: Demographics & Explanations

### Demographic Pages
- Insert demographic questions at any point in the survey flow
- Question types: text input, multiple choice, numeric, dropdown, checkboxes
- Questions can be required or optional
- Privacy controls (K-anonymity, differential privacy)

### Explanation Pages
- Insert informational content between questions
- Supports markdown formatting
- Use for context, instructions, or educational content

---

## Admin: Results & Export

### Real-Time Monitoring
- View participation metrics per question
- See demographic data distribution
- Track response counts
- Monitor solution consensus in real-time

### Export Options
| Format | Contents |
|--------|----------|
| CSV/Excel | All survey responses with consensus scores |
| Demographic CSV | Demographic data with privacy indicators |
| Full Export | Complete participant data |

### Data Management
- Mark responses as test data
- Clear test data before launch
- Filter test vs. real responses

---

## Smart Features

### Thompson Sampling
The Mass Consensus app uses an intelligent algorithm for loading solutions:
- Prioritizes solutions that need more evaluations
- Reduces redundant evaluations of already well-evaluated solutions
- Improves data quality and survey efficiency

### AI Feedback (Optional)
- AI-generated improvement suggestions for participant solutions
- Compares submissions to top-performing solutions
- Provides specific, actionable tips
- One feedback per user per question

---

# Language Support

All three apps support 6 languages:

| Language | Code | Direction |
|----------|------|-----------|
| English | en | LTR |
| Hebrew | he | RTL |
| Arabic | ar | RTL |
| Spanish | es | LTR |
| German | de | LTR |
| Dutch | nl | LTR |

- Language can be auto-detected from the browser
- Admins can set a default language per discussion/document/survey
- Admins can force a specific language (preventing user override)
- RTL languages automatically adjust layout direction

---

# Accessibility

All apps follow WCAG AA standards:

| Feature | Description |
|---------|-------------|
| Keyboard Navigation | Full keyboard access to all features |
| Screen Reader | ARIA labels and semantic HTML throughout |
| High Contrast | Enhanced visibility mode for low-vision users |
| Text Sizing | Adjustable text size controls |
| Reduced Motion | Respects `prefers-reduced-motion` system setting |
| RTL Support | Full right-to-left layout for Arabic and Hebrew |
| Focus Indicators | Visible focus outlines for keyboard users |
| Alt Text | Required for all images |
| Color Contrast | All text meets AA contrast ratios |

---

*This guide covers all features available in the WizCol platform as of February 2026. Features may be added or modified in future updates.*
