# Version Control System - Admin Guide

## Overview

The Paragraph Version Control System enables document administrators to review and approve community suggestions before they replace official paragraphs. This guide covers setup, configuration, and daily management.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Configuration](#configuration)
3. [Review Queue Workflow](#review-queue-workflow)
4. [Version History](#version-history)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Enabling Version Control

1. Navigate to your document's admin panel
2. Click **"Version Control"** in the sidebar
3. Toggle **"Enable Version Control"** to ON
4. Click **"Save Settings"**

**What happens when enabled:**
- Suggestions that reach the review threshold will appear in your review queue
- You'll receive notifications when new items are ready for review
- All paragraph changes will be tracked in version history

**What happens when disabled:**
- No new items will enter the review queue
- Existing queue items remain but won't be auto-queued
- Version history continues to be tracked

---

## Configuration

### Review Threshold

**What it is:** The minimum consensus percentage required for a suggestion to appear in your review queue.

**How to set it:**
1. Open Version Control Settings
2. Adjust the **"Review Threshold"** slider (0-100%)
3. Click **"Save Settings"**

**Example scenarios:**
- **50% threshold**: Suggestion needs at least half of voters to agree
- **70% threshold**: Suggestion needs strong majority support
- **30% threshold**: Lower bar, more suggestions reach queue (more work for you)

**Recommendation:** Start with 50% and adjust based on suggestion quality and your review capacity.

### Allow Admin Edit

**What it is:** Permission to modify suggestion text before approving it.

**When to enable:**
- You want flexibility to improve suggestions while approving the general idea
- Suggestions often need minor corrections (grammar, clarity)
- You trust yourself to stay true to community intent

**When to disable:**
- You want binary approve/reject (no middle ground)
- You prefer community to iterate suggestions themselves
- Transparency is more important than efficiency

**Default:** Enabled

---

## Review Queue Workflow

### Accessing the Queue

1. Navigate to **Admin Panel → Version Control**
2. View the **"Pending Reviews"** section
3. See all suggestions awaiting your decision

### Understanding Queue Items

Each queue item shows:
- **Consensus**: Current percentage of voter agreement
- **Vote count**: Number of users who evaluated the suggestion
- **Current text**: What's currently in the document
- **Proposed text**: What the suggestion wants to replace it with
- **Creator**: Who submitted the suggestion
- **Staleness warning**: If consensus has dropped significantly since queuing

### Sorting the Queue

Click the **"Sort by"** dropdown:
- **Consensus (High to Low)**: Review strongest suggestions first (recommended)
- **Date Added**: Review oldest first (FIFO)
- **Vote Count**: Review most-evaluated first

### Reviewing a Suggestion

1. Click **"Review"** on a queue item
2. Read both texts carefully in the modal
3. Check the consensus percentage:
   - **Created**: Consensus when it entered the queue
   - **Now**: Current consensus (updates in real-time)
4. Decide on action

### Approving a Suggestion

**Without editing:**
1. Click **"Approve"**
2. Optionally add admin notes (visible in version history)
3. Confirm

**Result:**
- Suggestion replaces the paragraph
- Version increments (e.g., v1 → v2)
- Old version saved to history
- Creator receives notification
- Queue item marked "approved"

**With editing (if enabled):**
1. Modify the text in the **"Proposed Text"** textarea
2. Add admin notes explaining your changes
3. Click **"Approve"**

**Result:**
- Your edited version replaces the paragraph
- Marked as "admin-edited" in version history
- Creator sees their suggestion was approved with modifications

### Rejecting a Suggestion

1. Click **"Reject"**
2. **Required:** Add admin notes explaining why (visible to creator)
3. Confirm

**Result:**
- Paragraph remains unchanged
- Queue item marked "rejected"
- Creator receives notification with your notes
- Suggestion can still be voted on by community

**Important:** Always provide clear, constructive rejection reasons. This helps:
- Creators understand what to improve
- Community learn your quality standards
- Build trust in the review process

### Handling Stale Suggestions

**What is staleness?**
A suggestion's consensus has dropped >10% since it entered the queue.

**Example:**
- Entered queue at 52% consensus
- Now at 42% consensus
- Warning: "Consensus dropped 10%"

**What to do:**
1. Check why consensus dropped (new voters disagree?)
2. Consider rejecting if support is weak
3. Or dismiss from queue (future feature)
4. Or approve if you still think it's valuable despite drop

---

## Version History

### Viewing Version History

1. Navigate to any paragraph in your document
2. Click the **version badge** (e.g., "v3")
3. View chronological list of all versions

**What you see:**
- Version number
- Date/time of change
- Who changed it (Admin or Community)
- Consensus percentage (for community suggestions)
- Admin notes (if provided)

### Expanding a Version

1. Click on any version in the list
2. View:
   - Full text of that version
   - Metadata (who, when, how)
   - Admin notes (if any)
3. Option to **"Restore This Version"** (if you're the owner)

### Restoring a Previous Version (Rollback)

**Permission required:** Document owner only (not regular admins)

**Steps:**
1. Open version history for a paragraph
2. Click on the version you want to restore
3. Click **"Restore This Version"**
4. Confirm: "Are you sure you want to restore to version X?"
5. Optionally add notes explaining the rollback

**What happens:**
- Current text replaced with old version's text
- Version number increments (doesn't overwrite)
- Example: At v5, rollback to v2 → Creates v6 with v2's text
- Audit trail records the rollback
- All admins notified

**Use cases for rollback:**
- Approved suggestion turned out problematic
- Community feedback indicates preference for earlier version
- Need to undo accidental approval
- Emergency revert during live crisis

---

## Best Practices

### Review Frequency

**Recommended:** Check queue at least once per day for active documents.

**Why:**
- Prevents queue backlog
- Shows community their input is valued
- Allows you to spot quality issues early
- Real-time consensus updates mean fresh suggestions are more relevant

### Communication with Community

**Do:**
- Provide clear rejection reasons
- Use admin notes to explain edits
- Acknowledge high-quality suggestions
- Be consistent in your standards

**Don't:**
- Reject without explanation
- Edit suggestions beyond recognition without explanation
- Ignore the queue for days
- Approve/reject based on personal preference alone (respect consensus)

### Threshold Tuning

**Monitor these signals:**
- Queue size: If overwhelming, raise threshold
- Suggestion quality: If poor quality reaching queue, raise threshold
- Community engagement: If good suggestions not reaching queue, lower threshold

**Adjustment strategy:**
- Start at 50%
- After 1 week, review queue size and quality
- Adjust in 5-10% increments
- Give changes 1-2 weeks to observe effects

### Handling Controversial Changes

If a suggestion has:
- High consensus (e.g., 70%) but you disagree
- Divided opinion in comments
- Potential to cause backlash

**Options:**
1. **Approve and trust consensus**: Community knows best
2. **Reject with detailed explanation**: Use your expertise
3. **Edit to middle ground**: Compromise (if editing enabled)
4. **Delay decision**: Ask for more community input first

**Recommendation:** Lean toward trusting consensus (it's a consensus tool), but use your judgment for critical changes.

---

## Troubleshooting

### "Queue is empty but I know suggestions exist above threshold"

**Possible causes:**
1. Version control disabled → Enable it
2. Suggestions added before enabling → They won't auto-queue
3. Threshold recently raised → Old suggestions below new threshold

**Fix:** Check settings, ensure enabled, consider lowering threshold temporarily.

### "Real-time consensus not updating"

**Possible causes:**
1. Network connectivity issue
2. Browser tab inactive (some browsers pause updates)

**Fix:**
1. Refresh the page
2. Check internet connection
3. Ensure browser is active

### "Can't restore version (no button visible)"

**Cause:** Only document **owner** can restore versions (not regular admins).

**Fix:** Contact document owner or have them grant you owner role.

### "Approved suggestion didn't replace paragraph"

**Possible causes:**
1. Network error during approval
2. Transaction conflict (rare)

**Fix:**
1. Check if queue item shows "approved" status
2. Refresh document to see if change applied
3. If still not applied, try again or contact support

### "Too many notifications"

**Future feature:** Notification settings will allow:
- Digest mode (hourly/daily batches)
- Threshold filters (only >70% consensus)
- Quiet hours

**Current workaround:** Check queue manually on your schedule instead of relying on notifications.

---

## Metrics to Track

Monitor these for health:
1. **Approval rate**: % of queue items approved vs rejected
   - Healthy range: 60-80% approved
   - Too high (>90%): Threshold might be too high or you're not critical enough
   - Too low (<40%): Threshold too low or community misaligned

2. **Average approval time**: Time from queue creation to decision
   - Target: <24 hours for active documents
   - >3 days: Queue backlog building

3. **Restoration frequency**: Rollbacks per month
   - Target: <2 per month
   - High rollback rate: Review process needs improvement

---

## Support

**Questions or issues?**
- Check the [User Guide](VERSION_CONTROL_USER_GUIDE.md) for community perspective
- Report bugs: [GitHub Issues](https://github.com/anthropics/freedi-app/issues)
- Feature requests: Same GitHub link

**Version:** 1.0.0 (MVP - Manual Mode)
**Last Updated:** January 2026
