# QA Testing Checklist - Freedi Apps

This comprehensive QA checklist covers all three Freedi applications:
1. **Freedi** (Main App) - Deliberative democracy platform
2. **Mass Consensus** - Survey and consensus gathering
3. **Sign** - Document signing and approval

## Quick Reference

| App | Local URL | Production URL |
|-----|-----------|----------------|
| Freedi | http://localhost:5173 | https://freedi.delib.org |
| Mass Consensus | http://localhost:3000 | https://mc.delib.org |
| Sign | http://localhost:3001 | https://sign.delib.org |

---

## Pre-Testing Setup

### Environment Checklist
- [ ] All apps are running locally (or testing against staging/production)
- [ ] Test accounts are available (Google auth test account)
- [ ] Test data exists (statements, surveys, documents)
- [ ] Browser console is open for error monitoring
- [ ] Network tab is open for API monitoring

### Browsers to Test
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Chrome (iOS & Android)
- [ ] Mobile Safari (iOS)

---

# 1. FREEDI (Main App)

## 1.1 Authentication Flow

### Login Page (`/login-first`)
- [ ] Page loads without errors
- [ ] Google sign-in button is visible and clickable
- [ ] Loading state displays during authentication
- [ ] Successful login redirects to `/home`
- [ ] Failed login shows appropriate error message
- [ ] Page is responsive on mobile

### Session Management
- [ ] Session persists after page refresh
- [ ] Session persists after closing and reopening browser
- [ ] Logout clears session properly
- [ ] Protected routes redirect to login when not authenticated

---

## 1.2 Home Page (`/home`)

### Layout & Display
- [ ] Page loads without errors
- [ ] Navigation header/footer is visible
- [ ] Statement feed loads (or shows empty state)
- [ ] Loading indicator shows while fetching
- [ ] No horizontal scroll on mobile

### Statement Feed
- [ ] Statements display with title and preview
- [ ] Statements show vote/evaluation indicators
- [ ] Clicking statement navigates to detail page
- [ ] Real-time updates when new statements appear
- [ ] Pagination/infinite scroll works (if applicable)

### Navigation
- [ ] Profile/account link works
- [ ] Add statement button is visible
- [ ] Navigation items are accessible via keyboard

---

## 1.3 Statement Creation (`/home/addStatement`)

### Form Display
- [ ] Form loads without errors
- [ ] Text input field is visible
- [ ] Statement type selector works (if applicable)
- [ ] Character counter shows (if applicable)

### Validation
- [ ] Empty submission shows validation error
- [ ] Minimum length validation works
- [ ] Maximum length validation works
- [ ] Special characters are handled properly

### Submission
- [ ] Submit button is enabled when form is valid
- [ ] Loading state shows during submission
- [ ] Successful creation redirects to statement
- [ ] Failed submission shows error message
- [ ] Created statement appears in feed

---

## 1.4 Statement Detail (`/statement/:id`)

### Content Display
- [ ] Statement title displays correctly
- [ ] Statement content displays correctly
- [ ] Author information shows
- [ ] Creation date shows
- [ ] Child statements/options load

### Voting/Evaluation
- [ ] Evaluation buttons are visible (5-point scale)
- [ ] Clicking evaluation updates UI
- [ ] Evaluation persists after page refresh
- [ ] Consensus score displays
- [ ] Vote counts update in real-time

### Navigation
- [ ] Back navigation works
- [ ] Child statement links work
- [ ] Share functionality works (if applicable)

### Error States
- [ ] Non-existent statement shows 404/error
- [ ] Unauthorized access handled properly
- [ ] Network errors handled gracefully

---

## 1.5 User Profile (`/my`)

### Display
- [ ] Profile page loads without errors
- [ ] User name displays correctly
- [ ] Profile picture displays (or placeholder)
- [ ] Settings options are visible

### Profile Updates
- [ ] Name can be edited
- [ ] Profile picture can be changed
- [ ] Settings changes save properly
- [ ] Success/error feedback shows

---

## 1.6 Accessibility (Freedi)

### Keyboard Navigation
- [ ] All interactive elements are focusable
- [ ] Focus order is logical
- [ ] Focus indicator is visible
- [ ] Enter/Space activates buttons
- [ ] Escape closes modals

### Screen Reader
- [ ] Page has proper heading structure (h1, h2, etc.)
- [ ] Images have alt text
- [ ] Form inputs have labels
- [ ] Error messages are announced
- [ ] Loading states are announced

### Visual
- [ ] Sufficient color contrast
- [ ] Text is readable at 200% zoom
- [ ] No information conveyed by color alone

---

# 2. MASS CONSENSUS

## 2.1 Landing & Authentication

### Landing Page (`/`)
- [ ] Page loads without errors
- [ ] Participant path is visible
- [ ] Admin/creator path is visible
- [ ] Branding/logo displays

### Login (`/login`)
- [ ] Google login button works
- [ ] Anonymous/guest login works
- [ ] Redirect parameter is preserved
- [ ] Error messages display properly

---

## 2.2 Survey Participation

### Welcome Page (`/s/:surveyId`)
- [ ] Survey title displays
- [ ] Question count badge shows
- [ ] Start button is visible
- [ ] "How it works" instructions display (if enabled)
- [ ] Survey description shows

### Question Evaluation (`/s/:surveyId/q/:index`)
- [ ] Question text displays correctly
- [ ] Options/solutions display
- [ ] 5-point evaluation scale is visible
- [ ] Clicking evaluation shows feedback
- [ ] Progress bar updates
- [ ] Navigation buttons work (Back/Next)
- [ ] Minimum evaluations enforced

### Demographics (if configured)
- [ ] Demographic page displays at correct position
- [ ] All options are selectable
- [ ] Selection persists
- [ ] Form submission works

### Completion (`/s/:surveyId/complete`)
- [ ] Completion message displays
- [ ] Statistics show
- [ ] Email signup option works (if enabled)
- [ ] Review answers button works (if enabled)

### Resume Functionality
- [ ] Resume modal shows for in-progress surveys
- [ ] "Continue" resumes from last position
- [ ] "Start over" clears progress

---

## 2.3 Admin Dashboard

### Survey List (`/admin/surveys`)
- [ ] Dashboard loads without errors
- [ ] Survey cards display
- [ ] Status badges show (Active/Draft/Closed)
- [ ] Response statistics display
- [ ] Create button is visible

### Survey Creation (`/admin/surveys/new`)
- [ ] Form loads properly
- [ ] Title field works
- [ ] Description field works
- [ ] Validation errors show
- [ ] Save creates survey

### Survey Editing (`/admin/surveys/:id`)
- [ ] Edit page loads
- [ ] Title/description editable
- [ ] Question picker works
- [ ] Question reordering works (drag-drop)
- [ ] Settings toggles work
- [ ] Save persists changes

### Survey Preview
- [ ] Preview opens (new tab or inline)
- [ ] Preview matches participant view
- [ ] Can test evaluation flow

### Survey Deletion
- [ ] Delete button shows confirmation
- [ ] Cancel keeps survey
- [ ] Confirm deletes survey
- [ ] Redirects to list after deletion

---

## 2.4 Results & Analytics

### Results Page (`/admin/surveys/:id/results`)
- [ ] Results page loads
- [ ] Participation stats display
- [ ] Question results display
- [ ] Consensus scores show
- [ ] Export option works (if available)

---

## 2.5 Accessibility (Mass Consensus)

### Survey Participation
- [ ] Evaluation buttons are keyboard accessible
- [ ] Progress announced to screen readers
- [ ] Navigation works with keyboard only
- [ ] Focus management on page transitions

### Admin Interface
- [ ] Forms have proper labels
- [ ] Error messages are accessible
- [ ] Drag-drop has keyboard alternative

---

# 3. SIGN APP

## 3.1 Authentication

### Login (`/login`)
- [ ] Google login works
- [ ] Guest login works
- [ ] Redirect parameter preserved
- [ ] Loading states display

### Protected Routes
- [ ] Document access requires auth (or allows guests)
- [ ] Admin pages require proper permissions
- [ ] Unauthorized access handled gracefully

---

## 3.2 Document Viewing

### Document Page (`/doc/:id`)
- [ ] Document loads without errors
- [ ] Title displays correctly
- [ ] All paragraphs render
- [ ] Text direction (RTL/LTR) is correct
- [ ] Loading state shows

### Table of Contents (if enabled)
- [ ] TOC displays
- [ ] TOC items are clickable
- [ ] Clicking scrolls to section
- [ ] Active section highlighted

### Comments
- [ ] Comment indicators show on paragraphs
- [ ] Comment counts are accurate
- [ ] Clicking expands comments
- [ ] Can add new comments (if allowed)

### Header & Branding
- [ ] Custom header displays (if configured)
- [ ] Logo displays (if configured)
- [ ] Header color is correct

### Video (if enabled)
- [ ] Video player loads
- [ ] Video plays correctly
- [ ] Required viewing enforced (if configured)

---

## 3.3 Document Signing

### Signature Functionality
- [ ] Sign button is visible
- [ ] Clicking sign shows confirmation
- [ ] Signature status updates
- [ ] Signed state persists

### Paragraph Approval
- [ ] Approval buttons on paragraphs
- [ ] Clicking approves paragraph
- [ ] Approval indicator shows
- [ ] Approval count updates

### Suggestions (if enabled)
- [ ] Suggest button visible
- [ ] Suggestion form opens
- [ ] Can submit suggestion
- [ ] Suggestion count updates

### Progress Tracking
- [ ] Progress indicator shows
- [ ] Completed sections marked
- [ ] Progress persists

---

## 3.4 Admin Features

### Document Settings (`/doc/:id/admin/settings`)
- [ ] Settings page loads
- [ ] Text direction configurable
- [ ] Language configurable
- [ ] Visibility options work
- [ ] Save persists changes

### Team Management (`/doc/:id/admin/team`)
- [ ] Team page loads
- [ ] Member list displays
- [ ] Can add members
- [ ] Can remove members
- [ ] Permissions work

### Document Editor (`/doc/:id/admin/editor`)
- [ ] Editor loads
- [ ] Can edit paragraphs
- [ ] Can add paragraphs
- [ ] Save works

### Version History (`/doc/:id/admin/versions`)
- [ ] Version list displays
- [ ] Can view previous versions
- [ ] Can compare versions (if available)
- [ ] Rollback works (if available)

### Collaboration (`/doc/:id/admin/collaboration`)
- [ ] Collaboration settings load
- [ ] Share link works
- [ ] Invite collaborators works

---

## 3.5 Accessibility (Sign)

### Document Reading
- [ ] Proper heading structure
- [ ] Keyboard navigation through document
- [ ] Screen reader announces content properly
- [ ] High contrast mode works (if available)
- [ ] Enhanced visibility mode works

### Signing Interface
- [ ] Buttons are keyboard accessible
- [ ] Status changes announced
- [ ] Progress announced

---

# Cross-App Testing

## Mobile Responsiveness (All Apps)
- [ ] No horizontal scroll on any page
- [ ] Touch targets are at least 44x44px
- [ ] Text is readable without zooming
- [ ] Navigation works on mobile
- [ ] Forms are usable on mobile

## Performance (All Apps)
- [ ] Pages load within 3 seconds
- [ ] No visible layout shifts
- [ ] Images optimized
- [ ] Smooth animations (60fps)

## Error Handling (All Apps)
- [ ] Network errors show user-friendly messages
- [ ] 404 pages display properly
- [ ] Server errors handled gracefully
- [ ] Form errors are clear and helpful

## Localization (All Apps)
- [ ] Hebrew text displays correctly (RTL)
- [ ] English text displays correctly (LTR)
- [ ] Mixed content handles properly
- [ ] Date/time formats are correct

---

# Running Automated Tests

## Using Playwright

```bash
# Install Playwright
cd qa && npm install

# Run all tests
npm run test:qa

# Run specific app tests
npm run test:qa:freedi
npm run test:qa:mc
npm run test:qa:sign

# Run with UI
npm run test:qa:ui

# View report
npm run test:qa:report
```

## Test Data Setup

For automated tests to work, ensure:
1. Test survey exists with ID `test-survey-id`
2. Test document exists with ID `test-document-id`
3. Test user credentials are configured

---

# Bug Report Template

When reporting bugs, include:

```markdown
## Bug Report

**App:** [Freedi / Mass Consensus / Sign]
**Environment:** [Local / Staging / Production]
**Browser:** [Chrome / Firefox / Safari]
**Device:** [Desktop / Mobile iOS / Mobile Android]

### Description
[What happened]

### Steps to Reproduce
1.
2.
3.

### Expected Behavior
[What should have happened]

### Actual Behavior
[What actually happened]

### Screenshots/Videos
[If applicable]

### Console Errors
[Any errors from browser console]

### Network Errors
[Any failed API calls]
```

---

# Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-02-04 | QA Team | Initial checklist |
