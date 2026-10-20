/**
 * Writes src/generated/i18nClientKeys.json: the translation keys MC's client
 * can ask for.
 *
 * The root layout sends the client only these keys instead of the whole
 * ~5,000-entry dictionary, which keeps every page's HTML/RSC payload small.
 *
 * A key is "used" when it appears as a string literal anywhere in the scanned
 * sources (t('key'), labelKey: 'key', enum values, ...), found by parsing each
 * file with the TypeScript compiler. A key assembled at runtime from pieces
 * would not be found; MC has none (there is no t(`...${x}`) in the code), and
 * a missing key shows its own text, as it always has.
 *
 * Runs automatically before `next build` (npm "prebuild"), and a jest test
 * fails when the committed file is stale.
 *
 * Usage: node scripts/generate-i18n-keys.js
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

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

function isStringLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** Every string literal in a file (template literals without interpolation included). */
function literalsOf(text) {
  const source = ts.createSourceFile('source.tsx', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const literals = [];
  const visit = (node) => {
    if (isStringLiteral(node)) literals.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);

  return literals;
}

/**
 * Sorted dictionary keys that occur as string literals in the sources.
 * @param {string[]} sourceTexts
 * @param {Set<string>} dictionaryKeys
 * @returns {string[]}
 */
function collectTranslationKeys(sourceTexts, dictionaryKeys) {
  const found = new Set();
  for (const text of sourceTexts) {
    literalsOf(text)
      .filter((literal) => dictionaryKeys.has(literal))
      .forEach((key) => found.add(key));
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
