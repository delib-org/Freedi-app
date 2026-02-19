import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

const db = getFirestore();

// Bot user agents that need OG tags
const BOT_USER_AGENTS = [
	'facebookexternalhit',
	'Facebot',
	'Twitterbot',
	'WhatsApp',
	'LinkedInBot',
	'Pinterest',
	'Slackbot',
	'TelegramBot',
	'Discordbot',
	'Googlebot',
	'bingbot',
];

/**
 * Checks if the request is from a social media crawler/bot
 */
function isSocialMediaBot(userAgent: string): boolean {
	if (!userAgent) return false;

	return BOT_USER_AGENTS.some((bot) => userAgent.toLowerCase().includes(bot.toLowerCase()));
}

/**
 * Generates HTML with OG meta tags for social media sharing
 */
function generateOgHtml(title: string, description: string, url: string, imageUrl: string): string {
	// Escape HTML entities to prevent XSS
	const escapeHtml = (str: string): string => {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	};

	const safeTitle = escapeHtml(title);
	const safeDescription = escapeHtml(description);

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:site_name" content="WizCol">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${url}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- Redirect to actual page for browsers -->
  <meta http-equiv="refresh" content="0;url=${url}">
</head>
<body>
  <p>Redirecting to <a href="${url}">${safeTitle}</a>...</p>
</body>
</html>`;
}

/**
 * Extracts statement ID from various URL patterns
 */
function extractStatementId(path: string): string | null {
	// Match patterns like:
	// /statement/STATEMENT_ID
	// /statement/STATEMENT_ID/...
	// /statement-an/STATEMENT_ID
	// /home/STATEMENT_ID
	const patterns = [/\/statement(?:-an)?\/([a-zA-Z0-9_-]+)/, /\/home\/([a-zA-Z0-9_-]+)/];

	for (const pattern of patterns) {
		const match = path.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}

	return null;
}

/**
 * Cloud Function to serve dynamic OG meta tags for statement sharing
 * This function intercepts requests from social media crawlers and serves
 * HTML with the correct OG tags based on the statement being shared.
 */
export const serveOgTags = onRequest(
	{
		...functionConfig,
		// Note: CORS only affects browser-based requests.
		// Social media bots (Facebook, WhatsApp, etc.) don't use CORS.
		cors: true,
	},
	async (req, res) => {
		const userAgent = req.headers['user-agent'] || '';
		const path = req.path || req.url || '';
		const host = req.headers.host || 'wizcol.com';
		const protocol = req.headers['x-forwarded-proto'] || 'https';
		const fullUrl = `${protocol}://${host}${path}`;
		const defaultImageUrl = `${protocol}://${host}/icons/logo-512px.png`;

		// Default values
		const defaultTitle = 'WizCol';
		const defaultDescription = 'WizCol: fostering collaboration';

		// If not a social media bot, serve a minimal HTML that loads the SPA
		// This avoids fetching index.html which can cause timeouts
		if (!isSocialMediaBot(userAgent)) {
			const spaHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WizCol</title>
  <script>window.location.replace('${fullUrl}');</script>
  <meta http-equiv="refresh" content="0;url=${fullUrl}">
</head>
<body>
  <p>Loading...</p>
</body>
</html>`;
			res.set('Content-Type', 'text/html');
			res.send(spaHtml);

			return;
		}

		// Extract statement ID from path
		const statementId = extractStatementId(path);

		if (!statementId) {
			// No statement ID found, serve default OG tags
			res.set('Content-Type', 'text/html');
			res.send(generateOgHtml(defaultTitle, defaultDescription, fullUrl, defaultImageUrl));

			return;
		}

		try {
			// Fetch statement from Firestore
			const statementDoc = await db.collection(Collections.statements).doc(statementId).get();

			if (!statementDoc.exists) {
				// Statement not found, serve default OG tags
				res.set('Content-Type', 'text/html');
				res.send(generateOgHtml(defaultTitle, defaultDescription, fullUrl, defaultImageUrl));

				return;
			}

			const statement = statementDoc.data() as Statement;

			// Use statement title as the OG title, with WizCol as site name
			const title = statement.statement || defaultTitle;
			const description =
				(statement as Statement & { description?: string }).description || defaultDescription;

			// Use statement image if available, otherwise default logo
			const imageUrl = defaultImageUrl;

			res.set('Content-Type', 'text/html');
			res.send(generateOgHtml(title, description, fullUrl, imageUrl));
		} catch (error) {
			logError(error, {
				operation: 'dynamicOgTags.serveOgTags',
				statementId: statementId ?? undefined,
				metadata: { path },
			});

			// On error, serve default OG tags
			res.set('Content-Type', 'text/html');
			res.send(generateOgHtml(defaultTitle, defaultDescription, fullUrl, defaultImageUrl));
		}
	},
);
