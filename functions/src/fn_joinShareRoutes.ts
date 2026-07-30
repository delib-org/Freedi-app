/**
 * `serveJoinShareRoutes` — serves the Join app's share routes (`/q/**`, `/m/**`)
 * so link previews (WhatsApp, Telegram, Facebook, Slack, …) show the *question*
 * being shared instead of the generic "WizCol-Join" card baked into
 * `apps/join/index.html`.
 *
 * The Join app is a Mithril SPA on Firebase Hosting, so its static
 * `index.html` carries one fixed set of OG tags and crawlers never run the JS
 * that would swap them. The `join` hosting target therefore rewrites the share
 * route shapes (`/q/**`, `/m/**`) to this function, which branches on the
 * User-Agent:
 *
 *   • crawler  → a small HTML document with per-statement OG/Twitter tags
 *                (title = the question, description = its sub-questions).
 *   • everyone → the untouched static app shell, fetched from the same host's
 *     else       `/index.html` and cached in instance memory.
 *
 * Responses are `no-store` on purpose: Hosting's CDN keys on URL only (not
 * User-Agent), so a cached crawler response would leak the redirect stub to
 * humans — and a cached human response would hide the OG tags from crawlers.
 */
import { onRequest, Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, StatementType, functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

const db = getFirestore();

const BOT_USER_AGENTS = [
	'facebookexternalhit',
	'facebookcatalog',
	'facebot',
	'twitterbot',
	'whatsapp',
	'linkedinbot',
	'pinterest',
	'slackbot',
	'slack-imgproxy',
	'telegrambot',
	'discordbot',
	'googlebot',
	'google-inspectiontool',
	'bingbot',
	'applebot',
	'redditbot',
	'vkshare',
	'skypeuripreview',
	'embedly',
	'quora link preview',
	'nuzzel',
	'outbrain',
	'iframely',
	'viber',
	'line-podcast',
	'mastodon',
	'opengraph',
	'metainspector',
];

/** How many sub-questions to name in the preview before collapsing the rest
 *  into a "+N more" tail. WhatsApp shows ~2 short lines of description, so a
 *  longer list is wasted bytes. */
const MAX_LISTED_SUB_QUESTIONS = 5;
/** Preview description budget. Crawlers truncate well before this; the cap is
 *  here so a wall of text never reaches them. */
const MAX_DESCRIPTION_LENGTH = 300;
/** App-shell cache lifetime. Long enough that a burst of clicks on a shared
 *  link costs one origin fetch, short enough that a fresh deploy's asset
 *  hashes are picked up quickly. */
const SHELL_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_TITLE = 'WizCol-Join';
const DEFAULT_DESCRIPTION = 'Propose, evaluate and choose solutions together.';

function isSocialMediaBot(userAgent: string): boolean {
	if (!userAgent) return false;
	const ua = userAgent.toLowerCase();

	return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/** Collapses newlines/repeated spaces so a multi-line statement body can't
 *  break out of a `content="…"` attribute layout, and trims to `max`. */
function normalizeText(value: string, max: number): string {
	const flat = value.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;

	return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The statement a Join URL is "about" — the deepest id in the path, since that
 * is the screen the sharer was looking at.
 *
 *   /q/:qid                  /m/:mid
 *   /q/:qid/s/:sid           /m/:mid/q/:qid
 *                            /m/:mid/q/:qid/s/:sid
 *
 * Returns null for any other path (login, invite, root), which then gets the
 * app's default card.
 */
export function extractJoinStatementId(path: string): string | null {
	const segments = path.split('?')[0].split('/').filter(Boolean);
	if (segments.length === 0) return null;
	if (segments[0] !== 'q' && segments[0] !== 'm') return null;

	let statementId: string | null = null;
	for (let i = 0; i < segments.length; i += 2) {
		const key = segments[i];
		const value = segments[i + 1];
		if (key !== 'q' && key !== 'm' && key !== 's') return statementId;
		if (!value || !/^[a-zA-Z0-9_-]+$/.test(value)) return statementId;
		statementId = value;
	}

	return statementId;
}

/** Builds the description line: the statement's visible sub-questions when it
 *  has any (the hub case the share button is usually pressed from), otherwise
 *  its cached body preview. */
export function buildDescription(statement: Statement, subQuestions: Statement[]): string {
	const titles = subQuestions
		.map((s) => normalizeText(s.statement ?? '', 80))
		.filter((title) => title.length > 0);

	if (titles.length > 0) {
		// Drop whole items rather than cutting one mid-word: a preview that ends
		// on a complete sub-question plus "+N more" reads better than a clipped
		// title. The newlines survive into the meta tag as `&#10;`.
		const bullets = titles.map((title) => `• ${title}`);
		let shown = Math.min(bullets.length, MAX_LISTED_SUB_QUESTIONS);

		const render = (count: number): string => {
			const lines = bullets.slice(0, count);
			const remaining = bullets.length - count;
			if (remaining > 0) lines.push(`• +${remaining} more`);

			return lines.join('\n');
		};

		while (shown > 1 && render(shown).length > MAX_DESCRIPTION_LENGTH) shown -= 1;

		const out = render(shown);

		// A single sub-question longer than the whole budget is the only case
		// left — clip that one title.
		return out.length > MAX_DESCRIPTION_LENGTH ? normalizeText(out, MAX_DESCRIPTION_LENGTH) : out;
	}

	// `description` is the function-maintained preview of the paragraph
	// children; `brief` is the admin-authored tagline fallback.
	const body = statement.description || statement.brief;
	if (body) return normalizeText(body, MAX_DESCRIPTION_LENGTH);

	return DEFAULT_DESCRIPTION;
}

/** Visible (non-hidden) question children, in the same admin-controlled order
 *  the hub renders them in: `order` first, then creation time. */
async function fetchSubQuestions(statementId: string): Promise<Statement[]> {
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', statementId)
		.where('statementType', '==', StatementType.question)
		.get();

	return snap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => s.hide !== true)
		.sort((a, b) => {
			const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
			const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
			if (ao !== bo) return ao - bo;

			return (a.createdAt ?? 0) - (b.createdAt ?? 0);
		});
}

interface OgFields {
	title: string;
	description: string;
	url: string;
	imageUrl: string;
	locale?: string;
}

function generateOgHtml({ title, description, url, imageUrl, locale }: OgFields): string {
	const safeTitle = escapeHtml(title);
	// OG description is a single attribute value; the bullet list keeps its
	// newlines as `&#10;` so crawlers that honour them render one item per line
	// and those that don't just collapse the whitespace.
	const safeDescription = escapeHtml(description).replace(/\n/g, '&#10;');
	const safeUrl = escapeHtml(url);
	const safeImage = escapeHtml(imageUrl);

	return `<!DOCTYPE html>
<html lang="${escapeHtml(locale ?? 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${safeImage}">
  <!-- Declared dimensions let WhatsApp render the card without waiting to
       download and measure the image first. -->
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta property="og:site_name" content="WizCol-Join">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:url" content="${safeUrl}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">

  <link rel="canonical" href="${safeUrl}">
  <!-- A human landing here (a crawler UA in a real browser) still gets the app. -->
  <meta http-equiv="refresh" content="0;url=${safeUrl}">
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDescription}</p>
  <p><a href="${safeUrl}">${escapeHtml(DEFAULT_TITLE)}</a></p>
</body>
</html>`;
}

interface ShellCache {
	html: string;
	fetchedAt: number;
}

let shellCache: ShellCache | null = null;

/**
 * The static app shell. `/index.html` is an exact static match on Hosting, so
 * fetching it does not re-enter this function (the rewrites only cover
 * `/q/**` and `/m/**`). A stale cached copy is preferred over an error page if
 * the origin fetch fails.
 */
async function getAppShell(origin: string): Promise<string | null> {
	const now = Date.now();
	if (shellCache && now - shellCache.fetchedAt < SHELL_TTL_MS) return shellCache.html;

	try {
		const response = await fetch(`${origin}/index.html`, {
			headers: { 'cache-control': 'no-cache' },
		});
		if (!response.ok) throw new Error(`Shell fetch returned ${response.status}`);
		const html = await response.text();
		if (!html.includes('<div id="app"')) throw new Error('Shell fetch returned unexpected HTML');
		shellCache = { html, fetchedAt: now };

		return html;
	} catch (error) {
		logError(error, {
			operation: 'joinShareRoutes.getAppShell',
			metadata: { origin, servedStale: shellCache !== null },
		});

		return shellCache?.html ?? null;
	}
}

/** Last-resort page when the shell can't be fetched: reload the same URL a
 *  moment later rather than dumping the user on a dead end. */
function retryHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${DEFAULT_TITLE}</title>
  <meta http-equiv="refresh" content="2">
</head>
<body><p>Loading…</p></body>
</html>`;
}

/** Exported for unit tests — the `onRequest` wrapper below is the only caller
 *  in production. */
export async function handleShareRequest(req: Request, res: Response): Promise<void> {
	const path = req.path || '/';
	const host = req.headers.host || 'join.wizcol.com';
	const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
	const origin = `${protocol}://${host}`;
	const fullUrl = `${origin}${req.originalUrl || path}`;

	res.set('Cache-Control', 'no-store');
	res.set('Content-Type', 'text/html; charset=utf-8');
	res.set('X-Content-Type-Options', 'nosniff');

	if (!isSocialMediaBot(req.headers['user-agent'] || '')) {
		const shell = await getAppShell(origin);
		if (!shell) {
			res.status(503).send(retryHtml());

			return;
		}
		res.status(200).send(shell);

		return;
	}

	res.set('Vary', 'User-Agent');
	const imageUrl = `${origin}/icons/icon-512.png`;
	const statementId = extractJoinStatementId(path);
	const fallback = (): void => {
		res.send(
			generateOgHtml({
				title: DEFAULT_TITLE,
				description: DEFAULT_DESCRIPTION,
				url: fullUrl,
				imageUrl,
			}),
		);
	};

	if (!statementId) {
		fallback();

		return;
	}

	try {
		const doc = await db.collection(Collections.statements).doc(statementId).get();
		if (!doc.exists) {
			fallback();

			return;
		}

		const statement = doc.data() as Statement;
		const subQuestions = await fetchSubQuestions(statementId);

		res.send(
			generateOgHtml({
				title: normalizeText(statement.statement || DEFAULT_TITLE, 120),
				description: buildDescription(statement, subQuestions),
				url: fullUrl,
				imageUrl,
				locale: statement.defaultLanguage,
			}),
		);
	} catch (error) {
		logError(error, {
			operation: 'joinShareRoutes.handleShareRequest',
			statementId,
			metadata: { path },
		});

		fallback();
	}
}

export const serveJoinShareRoutes = onRequest(
	{
		...functionConfig,
		timeoutSeconds: 30,
		// Every human click on a shared Join link lands here, so a cold start
		// would delay the splash screen. One warm instance keeps share links as
		// fast as the static serve they replaced.
		minInstances: 1,
		cors: true,
	},
	handleShareRequest,
);

/** Test seam: the app-shell cache lives for the life of the instance, so tests
 *  need a way back to a clean slate. */
export function __resetShellCacheForTests(): void {
	shellCache = null;
}
