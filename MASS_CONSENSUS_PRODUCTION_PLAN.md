# Mass Consensus - Production Development Plan

## Overview
תוכנית פיתוח להכנת Mass Consensus לפרודקשן.

---

## 1. 🔒 אכיפת הגשת הצעה לפני הערכה

### מצב נוכחי
- קיים hook `useEvaluationGuard.ts` שבודק את ההגדרה `askUserForASolutionBeforeEvaluation`
- קיים קומפוננט `AddSolutionPrompt.tsx` שמציג מודל התראה
- הלוגיקה קיימת אך צריך לוודא שהיא פועלת בכל המקומות הנכונים

### משימות

#### 1.1 בדיקת הלוגיקה הקיימת
- [ ] וידוא ש-`useEvaluationGuard` מחזיר ערכים נכונים
- [ ] בדיקה שההגדרה `askUserForASolutionBeforeEvaluation` נשמרת ונקראת כראוי מה-DB
- [ ] וידוא שה-guard מופעל ב-`RandomSuggestions.tsx`

#### 1.2 שיפור חוויית המשתמש
- [ ] אם המשתמש לא הגיש הצעה - להפנות אותו ישירות לשלב הגשת ההצעה
- [ ] להוסיף הודעה ברורה שמסבירה למה צריך להגיש הצעה קודם
- [ ] להסתיר את כפתורי הניווט להערכה עד שהמשתמש הגיש הצעה

#### 1.3 קבצים רלוונטיים
```
src/controllers/hooks/useEvaluationGuard.ts
src/view/components/evaluation/AddSolutionPrompt.tsx
src/view/pages/massConsensus/randomSuggestions/RandomSuggestions.tsx
src/view/pages/massConsensus/MassConsensusVM.ts
```

---

## 2. 📍 תיבת ההצעות - Fixed לתחתית

### מצב נוכחי
- הפוטר הנוכחי (`FooterMassConsensus.tsx`) משתמש ב-`position: sticky`
- תיבת הקלט נמצאת ב-`InitialQuestion.tsx`

### משימות

#### 2.1 עיצוב תיבת הקלט בתחתית
- [ ] ליצור קומפוננט חדש או לעדכן את `InitialQuestion.tsx`
- [ ] להעביר את ה-Textarea לתחתית עם `position: fixed`
- [ ] להוסיף padding-bottom לתוכן כדי שלא יסתיר תוכן

#### 2.2 עדכון ה-SCSS
```scss
// src/view/style/molecules/_proposal-input-fixed.scss (חדש)
.proposal-input-fixed {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--card-default);
  padding: var(--padding);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  z-index: 100;

  &__textarea {
    width: 100%;
    min-height: 80px;
    resize: none;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
}
```

#### 2.3 קבצים רלוונטיים
```
src/view/pages/massConsensus/massConsesusQuestion/initialQuestion/InitialQuestion.tsx
src/view/pages/massConsensus/massConsesusQuestion/initialQuestion/InitialQuestion.module.scss
src/view/pages/massConsensus/footerMassConsensus/FooterMassConsensus.module.scss
```

---

## 3. 🚀 דחיפה ל-Vercel

### משימות

#### 3.1 בדיקות לפני Deploy
- [ ] הרצת `npm run check-all` (lint, typecheck, build)
- [ ] בדיקה שכל הטסטים עוברים
- [ ] וידוא שאין שגיאות TypeScript

#### 3.2 הגדרת Vercel
- [ ] וידוא שקיים קובץ `vercel.json` עם הגדרות נכונות
- [ ] בדיקת משתני סביבה (Environment Variables) ב-Vercel
- [ ] הגדרת domain/subdomain מתאים

#### 3.3 Deploy
```bash
# Build locally first
npm run build

# Push to branch
git add .
git commit -m "Prepare mass-consensus for production"
git push origin claude/mass-consensus-production-013vQPV9qibXPci9x4gAGzZd

# Vercel will auto-deploy from branch (or manual trigger)
```

#### 3.4 בדיקות Post-Deploy
- [ ] בדיקה שהאתר עולה בכתובת הנכונה
- [ ] בדיקת פונקציונליות Mass Consensus מקצה לקצה
- [ ] בדיקת תאימות מובייל
- [ ] בדיקת ביצועים (Lighthouse)

---

## 4. 🏗️ הקמת סביבת Wizcol חדשה

### משימות

#### 4.1 הכנת הסביבה
- [ ] יצירת פרויקט Firebase חדש (או שימוש בקיים)
- [ ] הגדרת Firestore rules
- [ ] הגדרת Authentication providers
- [ ] הגדרת Cloud Functions (אם נדרש)

#### 4.2 משתני סביבה
- [ ] יצירת קובץ `.env.wizcol` או `.env.production.wizcol`
- [ ] הגדרת Firebase config:
  ```
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_STORAGE_BUCKET=
  VITE_FIREBASE_MESSAGING_SENDER_ID=
  VITE_FIREBASE_APP_ID=
  ```

#### 4.3 קבצים רלוונטיים
```
.env.example
firebase.json
firestore.rules
firestore.indexes.json
```

---

## 5. 🔗 חיבור Wizcol ו-Vercel

### משימות

#### 5.1 הגדרת Vercel Project
- [ ] יצירת פרויקט חדש ב-Vercel עבור wizcol
- [ ] חיבור ל-Git repository
- [ ] הגדרת branch לפריסה (production branch)

#### 5.2 Environment Variables ב-Vercel
- [ ] העתקת כל משתני הסביבה מ-`.env.wizcol`
- [ ] הגדרת משתנים שונים ל-Preview/Production

#### 5.3 Domain Configuration
- [ ] הגדרת custom domain (אם יש)
- [ ] הגדרת SSL certificate
- [ ] בדיקת DNS settings

#### 5.4 בדיקות אינטגרציה
- [ ] בדיקה ש-deploy אוטומטי עובד מ-push
- [ ] בדיקה שה-preview deployments עובדים
- [ ] בדיקה ש-production deploy עובד

---

## 📋 סדר עדיפויות מומלץ

| עדיפות | משימה | הערות |
|--------|-------|-------|
| 1 | אכיפת הגשת הצעה לפני הערכה | קריטי לחוויית משתמש נכונה |
| 2 | תיבת הצעות fixed לתחתית | שיפור UX |
| 3 | בדיקות וטסטים | לפני deploy |
| 4 | Deploy ל-Vercel | בדיקה בסביבה אמיתית |
| 5 | הקמת סביבת Wizcol | תשתית |
| 6 | חיבור Wizcol-Vercel | אינטגרציה סופית |

---

## 🧪 Checklist לפני Production

- [ ] כל הטסטים עוברים
- [ ] אין שגיאות TypeScript
- [ ] ESLint עובר ללא שגיאות
- [ ] Build מצליח
- [ ] נבדק במובייל
- [ ] נבדק בדפדפנים שונים (Chrome, Firefox, Safari)
- [ ] Error handling מלא
- [ ] Analytics מוגדר
- [ ] Performance נבדק (Lighthouse > 80)

---

## 📝 הערות טכניות

### Hook מרכזי - useEvaluationGuard
```typescript
// src/controllers/hooks/useEvaluationGuard.ts
const { canEvaluate, requiresSolution, hasSubmittedSolution } = useEvaluationGuard(statement);

// canEvaluate = true if:
//   1. askUserForASolutionBeforeEvaluation is false, OR
//   2. askUserForASolutionBeforeEvaluation is true AND user has submitted solution
```

### Stage Flow
```
introduction → question → random-suggestions → top-suggestions → voting → results
```

### Redux State
```typescript
// massConsensusSlice - key selectors
selectRandomStatements
selectCanGetNewSuggestions
selectAllOptionsEvaluated
selectCurrentBatchEvaluationProgress
```

---

*Created: 2025-11-23*
