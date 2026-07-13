/**
 * One-off migration: retype bold / numbered "section title" paragraphs that were
 * imported as ParagraphType.paragraph into real heading types (h2/h3/h4...).
 *
 * Why: Google Docs titles that were only *bold* (not styled with a Heading style)
 * import as NORMAL_TEXT -> ParagraphType.paragraph, so the app never treats them as
 * headings. That means the "Allow Header Reactions" setting can't suppress them and
 * they stay commentable. Retyping them to h2/h3/... makes the header rules apply.
 *
 * Safe by design:
 *   - Only touches paragraphs whose current type is 'paragraph'.
 *   - Only promotes ones that are FULLY bold AND (numbered like "1."/"1.1" OR a short
 *     standalone title). Body text with an inline bold phrase is left alone.
 *   - Writes ONLY the type fields (blockType + doc.paragraphType). Text is untouched.
 *   - Dry-run by default; prints the full plan. Pass --execute to write.
 *
 * Usage:
 *   node scripts/retype-titles-to-headings.cjs --doc <documentId>            # dry-run
 *   node scripts/retype-titles-to-headings.cjs --doc <documentId> --execute  # write
 *
 * Auth: uses Google Application Default Credentials (gcloud ADC) against wizcol-app.
 *   Override project with --project <projectId>.
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(name);

  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const DOC_ID = argVal('--doc', 'acbbf025-5910-4332-bf3f-89498b7fa257');
const PROJECT_ID = argVal('--project', 'wizcol-app');
const EXECUTE = args.includes('--execute');

// ---- heading heuristic (kept in sync with converter.ts) --------------------

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Length of visible text that sits inside <strong>/<b> wrappers. */
function boldTextLength(html) {
  let total = 0;
  const re = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    total += stripHtml(m[2]).length;
  }

  return total;
}

/** Visible text of the FIRST bold run in the html (empty string if none). */
function firstBoldText(html) {
  const m = String(html || '').match(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i);

  return m ? stripHtml(m[2]) : '';
}

const NUMBER_PREFIX = /^\s*(\d+(?:\.\d+)*)[.)]?\s+\S/;
/** Loose leading-number test used to check if a bold run *is* the numbering. */
const NUMBER_LEAD = /^\s*\d+(?:\.\d+)*[.)]?(?:\s|$)/;

/**
 * Returns the target heading ParagraphType ('h2'..'h6') if this paragraph looks
 * like a section title, otherwise null.
 */
function detectHeadingType(html) {
  const text = stripHtml(html);
  if (!text) return null;

  const visibleLen = text.length;
  const boldLen = boldTextLength(html);
  const hasBold = /<(strong|b)\b/i.test(String(html || ''));
  // "Fully bold": essentially the whole visible line is bold.
  const fullyBold = hasBold && boldLen >= Math.max(1, Math.floor(visibleLen * 0.9));
  // "Bold-led": the line begins with a bold run (e.g. a bold numbered title whose
  // trailing parenthetical clarification is not bold). Body text is never bold-led.
  const startsBold = /^\s*<(strong|b)\b/i.test(String(html || ''));
  // "Number is bold": the first bold run itself starts with the numbering — covers
  // titles wrapped in a colour <span> before the <strong> (e.g. "3.2 …" headings).
  const numberIsBold = NUMBER_LEAD.test(firstBoldText(html));

  const numMatch = text.match(NUMBER_PREFIX);
  if (numMatch) {
    // A numbered line whose number/title is bold is a section title.
    if (!fullyBold && !startsBold && !numberIsBold) return null;
    const depth = numMatch[1].split('.').length; // "1" -> 1, "1.1" -> 2
    const level = Math.min(depth + 1, 6); // 1 -> h2, 2 -> h3, 3 -> h4 ...

    return `h${level}`;
  }

  // Non-numbered: require the whole line to be bold and be a short standalone title.
  if (!fullyBold) return null;
  const wordCount = text.split(/\s+/).length;
  if (visibleLen <= 60 && wordCount <= 12 && !/[.!?]$/.test(text)) {
    return 'h2';
  }

  return null;
}

// ---------------------------------------------------------------------------

async function main() {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
  const db = getFirestore(app);

  console.info(`Project: ${PROJECT_ID}`);
  console.info(`Document: ${DOC_ID}`);
  console.info(`Mode: ${EXECUTE ? 'EXECUTE (will write)' : 'DRY-RUN (no writes)'}`);
  console.info('');

  const snap = await db
    .collection('statements')
    .where('parentId', '==', DOC_ID)
    .where('doc.isOfficialParagraph', '==', true)
    .get();

  console.info(`Fetched ${snap.size} official paragraph statements.`);

  const changes = [];
  const typeCounts = {};
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const currentType = d.blockType || d.doc?.paragraphType || 'paragraph';
    typeCounts[currentType] = (typeCounts[currentType] || 0) + 1;

    if (currentType !== 'paragraph') return; // only promote plain paragraphs

    const target = detectHeadingType(d.statement);
    if (!target) return;

    changes.push({
      id: docSnap.id,
      order: d.order ?? d.doc?.order ?? 0,
      newType: target,
      text: stripHtml(d.statement).slice(0, 60),
    });
  });

  changes.sort((a, b) => a.order - b.order);

  console.info('Current type distribution:', JSON.stringify(typeCounts));
  console.info(`\nWill retype ${changes.length} paragraph(s) to headings:\n`);
  for (const c of changes) {
    console.info(`  [${String(c.order).padStart(4)}] ${c.newType}  ${c.id}  "${c.text}"`);
  }

  if (!EXECUTE) {
    console.info('\nDRY-RUN only. Re-run with --execute to apply.');

    return;
  }

  // Apply in batches of 500.
  let written = 0;
  for (let i = 0; i < changes.length; i += 500) {
    const batch = db.batch();
    for (const c of changes.slice(i, i + 500)) {
      const ref = db.collection('statements').doc(c.id);
      batch.update(ref, {
        blockType: c.newType,
        'doc.paragraphType': c.newType,
        lastUpdate: Date.now(),
      });
    }
    await batch.commit();
    written += Math.min(500, changes.length - i);
    console.info(`Committed ${written}/${changes.length}`);
  }

  console.info(`\nDone. Retyped ${written} paragraph(s).`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
