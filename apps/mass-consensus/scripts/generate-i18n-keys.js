/**
 * Writes src/generated/i18nClientKeys.json: every translation key that MC's
 * source can ask for.
 *
 * The root layout sends the client only these keys instead of the whole
 * ~5,000-entry dictionary, which keeps every page's HTML/RSC payload small.
 * A key is "used" when it appears as a plain string literal anywhere in the
 * scanned sources (t('key'), labelKey: 'key', enum values, ...). Keys built at
 * runtime are not found here; the translation provider covers those by loading
 * the full dictionary on the first miss.
 *
 * Runs automatically before `next build` (npm "prebuild"), and a jest test
 * fails when the committed file is stale.
 *
 * Usage: node scripts/generate-i18n-keys.js
 */
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(APP_DIR, '../..');
const LANGUAGES_DIR = path.join(REPO_DIR, 'packages/shared-i18n/src/languages');
const OUTPUT_FILE = path.join(APP_DIR, 'src/generated/i18nClientKeys.json');

const SOURCE_ROOTS = [
  path.join(APP_DIR, 'src'),
  path.join(APP_DIR, 'app'),
  path.join(REPO_DIR, 'packages/shared-types/src'),
  path.join(REPO_DIR, 'packages/engagement-core/src'),
  path.join(REPO_DIR, 'packages/shared-utils/src'),
];
const SKIPPED_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', 'generated']);
const SOURCE_FILE = /\.(tsx?|jsx?|mjs)$/;
// '...' or "..." on one line, or a `...` template without ${} interpolation
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$\\]*)`/g;

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry.name)) return [];
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);

    return SOURCE_FILE.test(entry.name) ? [fullPath] : [];
  });
}

function readDictionaryKeys() {
  const keys = new Set();
  for (const file of fs.readdirSync(LANGUAGES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const dictionary = JSON.parse(fs.readFileSync(path.join(LANGUAGES_DIR, file), 'utf8'));
    Object.keys(dictionary).forEach((key) => keys.add(key));
  }

  return keys;
}

/** Sorted dictionary keys that occur as string literals in the sources. */
function collectTranslationKeys(sourceTexts, dictionaryKeys) {
  const found = new Set();
  for (const text of sourceTexts) {
    for (const match of text.matchAll(STRING_LITERAL)) {
      const literal = match[1] ?? match[2] ?? match[3];
      if (dictionaryKeys.has(literal)) found.add(literal);
    }
  }

  return [...found].sort();
}

function buildClientKeys() {
  const sourceTexts = SOURCE_ROOTS.flatMap(listSourceFiles).map((file) =>
    fs.readFileSync(file, 'utf8')
  );

  return collectTranslationKeys(sourceTexts, readDictionaryKeys());
}

function serializeKeys(keys) {
  return `${JSON.stringify(keys, null, 1)}\n`;
}

if (require.main === module) {
  const keys = buildClientKeys();
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, serializeKeys(keys));
  console.info(`[generate-i18n-keys] ${keys.length} keys -> ${path.relative(APP_DIR, OUTPUT_FILE)}`);
}

module.exports = { collectTranslationKeys, buildClientKeys, serializeKeys, OUTPUT_FILE };
