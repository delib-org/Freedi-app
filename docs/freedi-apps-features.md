---
pdf_options:
  format: A4
  margin: 25mm
  headerTemplate: '<div style="font-size:8px; width:100%; text-align:center; color:#888;">Freedi Platform - Feature Guide</div>'
  footerTemplate: '<div style="font-size:8px; width:100%; text-align:center; color:#888;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  displayHeaderFooter: true
stylesheet: []
body_class: freedi-doc
---

<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2d3748; line-height: 1.6; }
  h1 { color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 8px; font-size: 28px; }
  h2 { color: #2b6cb0; border-bottom: 2px solid #bee3f8; padding-bottom: 6px; font-size: 22px; margin-top: 30px; }
  h3 { color: #2c5282; font-size: 17px; margin-top: 20px; }
  h4 { color: #4a5568; font-size: 15px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
  th { background-color: #ebf4ff; color: #2b6cb0; padding: 8px 12px; text-align: left; border: 1px solid #bee3f8; }
  td { padding: 8px 12px; border: 1px solid #e2e8f0; }
  tr:nth-child(even) { background-color: #f7fafc; }
  blockquote { border-left: 4px solid #3182ce; padding: 8px 16px; background: #ebf8ff; margin: 12px 0; color: #2c5282; }
  code { background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .page-break { page-break-after: always; }
</style>

# Freedi Platform - Feature Guide

**Version 5.4** | March 2026

Freedi is an open-source platform for **scalable deliberative democracy**. It enables groups of any size to collaborate, evaluate ideas, and build consensus through continuous feedback.

The platform consists of three specialized applications, each designed for a different deliberation use case:

| App | Purpose | Best For |
|-----|---------|----------|
| **Freedi (Main App)** | Full deliberation platform | Group discussions, multi-stage decisions |
| **Mass Consensus** | Quick consensus at scale | Surveys, large audiences, anonymous feedback |
| **Freedi Sign** | Collaborative document review | Document signing, paragraph-level feedback |

---

<div class="page-break"></div>

# 1. Freedi - Main Application

The core deliberation platform where groups discuss topics, propose solutions, evaluate ideas, and reach consensus through a structured democratic process.

## 1.1 How It Works

Freedi follows a four-step cycle:

1. **Propose** - Participants create statements or solution options
2. **Evaluate** - Everyone rates proposals on a scale from -1 (oppose) to +1 (support)
3. **Aggregate** - The consensus algorithm calculates real-time scores
4. **Iterate** - Rankings inspire better proposals until consensus emerges

> **The Consensus Algorithm:** Freedi uses **Mean - SEM** (Standard Error of Mean) instead of simple voting. This prevents manipulation by small groups, rewards consistency, and allows new proposals to compete fairly as evaluations accumulate.

## 1.2 Core Features

### Creating & Managing Discussions

- **Create questions** on any topic for group deliberation
- **Propose options** as potential solutions or answers
- **Hierarchical structure** - nest sub-questions, options, and comments at any depth
- **Multi-stage questions** that guide groups through: Explanation, Suggestion, First Evaluation, Second Evaluation, Voting, and Results

### Evaluating & Voting

- **Continuous evaluation** on a -1 to +1 scale (not binary yes/no)
- **Real-time consensus scores** visible to all participants
- **Change your mind** - update evaluations at any time
- **Community voice evaluation** - evaluate using collective criteria

### Multiple Views

Participants can switch between different ways to visualize the same data:

| View | What It Shows |
|------|---------------|
| **Chat** | Threaded discussion with user avatars |
| **Options** | All proposals with evaluation scores, sortable by consensus |
| **Agreement Map** | Visual clusters showing areas of consensus and disagreement |
| **Collaboration Index** | Measures group polarization vs. unity |
| **Mind Map** | Tree visualization of the entire statement hierarchy |

### Groups & Rooms

- **Create groups** to organize participants
- **Room assignment** - create breakout rooms with diversity settings
- **Option joining** - participants form sub-groups around preferred options

## 1.3 Admin Features

### Facilitation Tools

- **Follow Me** - set a navigation path that participants can follow via links
- **Power Follow Me** - automatically redirect all non-admin users to a specific view
- **Member management** - approve, ban, or promote participants
- **Visibility controls** - hide unpublished options until ready

### Access Control

| Mode | Description |
|------|-------------|
| **Open** | Anyone can join and participate |
| **Registered** | Participants must create an account |
| **Moderated** | Admin approves each participant |
| **Secret** | Invitation only, hidden from public |

### Communication

- **Email invitations** with optional PIN codes
- **In-app notifications** for new proposals and updates
- **Push notifications** (mobile and desktop)

### Data & Export

- Export results in **JSON, CSV, SVG, and PNG** formats
- **Demographics collection** and filtering
- **AI-powered clustering** - automatically group similar ideas

## 1.4 AI-Powered Features

- **Similarity detection** - flag duplicate proposals before submission
- **Idea clustering** - AI groups related proposals for easier review
- **Proposal refinement** - AI assistance for improving proposal text

## 1.5 Platform Capabilities

- **6 languages** supported: English, Hebrew, Arabic, Spanish, German, Dutch, Persian
- **RTL support** - automatic right-to-left layout for Hebrew, Arabic, and Persian
- **Accessibility** - WCAG AA compliant with keyboard navigation, screen readers, and high contrast mode
- **Mobile responsive** - works on phones, tablets, and desktops
- **PWA** - installable as a progressive web app for offline access
- **Real-time** - all changes sync instantly across all participants

---

<div class="page-break"></div>

# 2. Mass Consensus App

A high-performance application designed for crowdsourced consensus building at scale. Optimized for speed, anonymous participation, and intuitive interaction through a swipe-based interface.

## 2.1 How It Works

1. An admin creates a question with initial solution proposals
2. Participants receive a link or QR code - **no login required**
3. Participants swipe through solutions, rating each one
4. Consensus scores calculate in real-time
5. Participants can submit their own solutions
6. Results are available immediately as votes accumulate

## 2.2 Core Features

### Swipe-Based Evaluation

The main interaction model uses intuitive swipe gestures:

| Swipe Direction | Rating | Meaning |
|-----------------|--------|---------|
| Far left | -1.0 | Strongly Disagree |
| Left | -0.5 | Disagree |
| Up (center) | 0.0 | Neutral |
| Right | +0.5 | Agree |
| Far right | +1.0 | Strongly Agree |

- **Visual zone indicators** with emoji feedback
- **Button-based alternative** for users who prefer clicking over swiping
- **Previous evaluation tracking** - see how you rated each solution before

### Solution Submission

- **Submit new solutions** (3-500 characters)
- **Duplicate detection** - the system checks for similar existing solutions before submission
- **Character count validation** with visual feedback

### Results & Tracking

- View all solutions sorted by **consensus score**
- See **participant count** and evaluation statistics
- **"My Solutions" tab** to track your submitted proposals
- Real-time score updates as new evaluations come in

### Surveys (Multi-Question Flow)

Admins can link multiple questions into a complete survey experience:

- **Opening slide** with custom branding and description
- **Demographic questions** to collect participant information
- **Explanation pages** with educational content between questions
- **Progress bar** showing current position in the survey
- **Completion screen** with achievement badges

### Achievement Badges

Participants earn recognition for different types of engagement:

- **Early Contributor** - among the first to evaluate
- **Thoughtful Evaluator** - evaluated many solutions
- **Solution Creator** - submitted original proposals
- **Consensus Participant** - contributed to consensus building

## 2.3 Admin Features

### Survey Management

- Create and manage **multi-question surveys**
- Set survey status: draft, active, or closed
- **Reorder questions** with drag-and-drop
- Add **demographic pages** and **explanation pages** between questions
- Custom **opening slides** with logos and branding

### Configuration

- **Language settings** - set default language or force a specific language for all participants
- **Test mode** - test the survey without affecting real results
- **Clear test data** before going live

### Results & Analytics

- Real-time response statistics
- Completion rates
- Export capabilities
- Demographic breakdowns

## 2.4 Key Differences from Main App

| Feature | Main App | Mass Consensus |
|---------|----------|----------------|
| **Login** | Required | Not required (anonymous) |
| **Interaction** | Read, comment, evaluate | Swipe to rate |
| **Focus** | Deep deliberation | Quick consensus |
| **Structure** | Hierarchical discussions | Flat solution list |
| **Speed** | Standard | Ultra-fast (< 1 second load) |
| **Surveys** | Not available | Full multi-question support |
| **Demographics** | Basic | Integrated collection |
| **Gamification** | Minimal | Achievement badges |

---

<div class="page-break"></div>

# 3. Freedi Sign

A collaborative document review and signing platform that enables crowdsourced feedback at the paragraph level. Designed for organizations that need democratic document improvement with transparent consensus building.

## 3.1 How It Works

1. An admin creates or uploads a document
2. The document is presented paragraph by paragraph
3. Participants can **sign**, **reject**, **comment on**, or **suggest changes** to any paragraph
4. Suggestions are voted on by all participants
5. When consensus is reached, changes can be applied (manually or automatically)
6. The document evolves through collective input

## 3.2 Core Features

### Document Signing

- **Sign a document** to record your approval (with timestamp)
- **Reject a document** with optional feedback explaining your reasoning
- **Signature counts** displayed in real-time
- **Progress tracking** - see how many participants have signed

### Paragraph-Level Suggestions

- **Propose alternative text** for any paragraph
- **Vote on suggestions** from other participants (thumbs up/down)
- **Real-time consensus percentage** for each suggestion
- **Visual progress bars** showing agreement levels
- Multiple suggestions per paragraph supported

### Comments & Discussion

- **Comment on specific paragraphs** to share thoughts
- **Nested discussion threads** for in-depth conversations
- **Real-time comment counts** on each paragraph
- Full transparency - all comments are visible to participants

### Heat Maps

Visual tools to understand engagement across the document:

| Heat Map Mode | What It Shows |
|---------------|---------------|
| **Views** | Which paragraphs are most read |
| **Support** | Consensus levels across paragraphs |
| **Importance** | Which paragraphs participants consider most important |

- **Color-coded paragraphs** based on engagement intensity
- **Demographic breakdowns** for targeted analysis

### Version History

- View all **past versions** of each paragraph
- See **who changed what** and when
- Compare old vs. new text side by side
- Full **audit trail** of document evolution

## 3.3 Admin Features

### Admin Dashboard

Quick overview with key metrics:

- Total participants, signatures, and rejections
- Comment and suggestion counts
- Most engaged paragraphs
- Average approval scores

### Document Editor

- **Rich text editing** with a visual editor
- Add, remove, and reorder paragraphs
- Configure heading levels and paragraph types
- Heading numbering (e.g., 1.1.1)

### Version Control System

The most powerful admin feature, with three modes:

| Mode | How It Works |
|------|--------------|
| **Manual** | Admin reviews a queue, accepts or rejects each suggestion with optional edits |
| **Timer** | Automatic batches on a schedule with optional admin approval |
| **Automatic** | Suggestions above the consensus threshold are applied in real-time |

**Review queue features:**
- Side-by-side comparison (current text vs. proposed change)
- Consensus score display for each suggestion
- Edit suggestions before approving
- Rejection with reason/notes
- Bulk operations (approve/reject multiple)

### Customization & Settings

- **Logo and branding** upload
- **Custom header colors**
- **Table of Contents** - enable/disable, set depth level, position
- **Explanation videos** - optional intro video before document viewing
- **Feature toggles** - enable/disable comments, suggestions, voting, and importance

### Privacy & Access

| Setting | Description |
|---------|-------------|
| **Public** | Anyone can view and interact |
| **Private** | Login required to access |
| **Google Login Required** | Force Google authentication |
| **Hide User Identity** | Anonymize participant names |
| **Show Signature Counts** | Toggle signature total visibility |

### Demographic Surveys

- Collect participant demographics (configurable questions)
- Make surveys optional or required
- Filter analytics by demographic data
- Export demographic data separately

### Team Management

- Add and remove collaborators
- Set roles: owner, editor, viewer
- Send and manage invitations

### Export & Analytics

- Export **signature data** (CSV)
- Export **engagement details** (CSV, JSON)
- Export **demographic data** separately
- **Heat map analytics** with demographic filtering

## 3.4 Accessibility & Language

- **6 languages** supported with automatic detection
- **RTL/LTR** automatic text direction
- **WCAG AA** compliant
- **High contrast mode** for visual accessibility
- **Enhanced visibility mode** for elderly users (larger, clearer buttons)
- **Keyboard navigation** throughout the interface
- **Accessibility widget** for quick adjustments

---

<div class="page-break"></div>

# Feature Comparison

| Feature | Freedi (Main) | Mass Consensus | Freedi Sign |
|---------|:---:|:---:|:---:|
| **User login required** | Yes | No | Configurable |
| **Continuous evaluation (-1 to +1)** | Yes | Yes (5 levels) | No |
| **Paragraph-level feedback** | No | No | Yes |
| **Document signing** | No | No | Yes |
| **Multi-stage questions** | Yes | No | No |
| **Swipe interface** | No | Yes | No |
| **Surveys** | No | Yes | No |
| **Heat maps** | No | No | Yes |
| **Version control** | No | No | Yes |
| **AI features** | Yes | Partial | No |
| **Discussion views (chat, map, etc.)** | Yes | No | No |
| **Room assignment** | Yes | No | No |
| **Follow Me facilitation** | Yes | No | No |
| **Achievement badges** | No | Yes | No |
| **Anonymous participation** | No | Yes | Configurable |
| **Push notifications** | Yes | No | No |
| **Multi-language (6+ languages)** | Yes | Yes | Yes |
| **RTL support** | Yes | Yes | Yes |
| **WCAG AA accessibility** | Yes | Yes | Yes |
| **Data export** | Yes | Yes | Yes |
| **Real-time collaboration** | Yes | Yes | Yes |
| **Mobile responsive** | Yes | Yes | Yes |

---

> **Learn more:** Visit [freedi.tech](https://freedi.tech) for documentation, demos, and getting started guides.
