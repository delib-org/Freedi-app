import type {
	AgoraApprovalSource,
	AgoraLibraryReport,
	AgoraReportTargetKind,
} from '@freedi/shared-types';

/**
 * The letter a system admin gets when a teacher files a library report.
 * Pure: everything it needs is passed in, so the wording is unit-tested and
 * the trigger (fn_onAgoraLibraryReportCreated) only gathers and sends.
 *
 * What goes in: what was reported (the scenario's title, and for a review or
 * a post the first words of it), the reason, the reporter's ROLE and a link
 * to the admin queue. What never goes in: names, uids or anything about a
 * student — reports are filed by teachers about teachers' content, and the
 * letter leaves our systems.
 */

/** How the reporter came to be allowed in the library (libraryAccess.ts#resolveApproval) */
export type LibraryReporterRole = AgoraApprovalSource | 'unknown';

export interface LibraryReportEmailInput {
	report: Pick<AgoraLibraryReport, 'reportId' | 'targetKind' | 'reason' | 'createdAt'>;
	/** The scenario the target belongs to; empty when it could not be read */
	scenarioTitle: string;
	/** The review's or post's own text, when the target is one */
	targetText?: string;
	reporterRole: LibraryReporterRole;
	/** Open reports on the queue including this one, when known */
	openCount?: number;
	queueUrl: string;
}

export interface LibraryReportEmail {
	subject: string;
	html: string;
	text: string;
}

export const LIBRARY_REPORT_EMAIL = {
	/** First words of a reported review/post shown in the letter */
	EXCERPT_MAX: 200,
	SUBJECT_TITLE_MAX: 60,
	/** The Agora route of the moderation queue (Mithril hash routing) */
	QUEUE_ROUTE: '/#!/teach/library/admin',
	DEFAULT_APP_URL: 'https://agora.wizcol.com',
} as const;

const KIND_LABEL: Record<AgoraReportTargetKind, string> = {
	scenario: 'תרחיש',
	review: 'המלצה על תרחיש',
	post: 'הודעה בדיון על תרחיש',
};

const ROLE_LABEL: Record<LibraryReporterRole, string> = {
	admin: 'מנהל/ת מערכת',
	school: 'מורה',
	supervisor: 'מפקח/ת',
	// An approved teacher with no live school attachment (approved request / grandfathered)
	granted: 'מורה מאושר/ת',
	unknown: 'מורה (התפקיד לא אומת)',
};

/** The queue's absolute address, from AGORA_APP_URL or the live default */
export function libraryQueueUrl(appUrl: string | undefined): string {
	const base = (appUrl && appUrl.trim()) || LIBRARY_REPORT_EMAIL.DEFAULT_APP_URL;

	return `${base.replace(/\/+$/, '')}${LIBRARY_REPORT_EMAIL.QUEUE_ROUTE}`;
}

/** Everything interpolated into the HTML is teacher-written: escape it all */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function clip(value: string, max: number): string {
	const flat = value.replace(/\s+/g, ' ').trim();

	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

interface Row {
	label: string;
	value: string;
}

function rows(input: LibraryReportEmailInput): Row[] {
	const { report } = input;
	const when = new Date(report.createdAt).toLocaleString('he-IL', {
		timeZone: 'Asia/Jerusalem',
	});
	const list: Row[] = [
		{ label: 'סוג', value: KIND_LABEL[report.targetKind] },
		{ label: 'תרחיש', value: input.scenarioTitle.trim() || '(לא נמצא)' },
	];
	if (report.targetKind !== 'scenario') {
		list.push({
			label: report.targetKind === 'review' ? 'ההמלצה' : 'ההודעה',
			value: input.targetText ? clip(input.targetText, LIBRARY_REPORT_EMAIL.EXCERPT_MAX) : '—',
		});
	}
	list.push(
		{ label: 'סיבה', value: report.reason.trim() || '(לא נכתבה סיבה)' },
		{ label: 'מדווח/ת', value: ROLE_LABEL[input.reporterRole] },
		{ label: 'זמן', value: when },
	);
	if (input.openCount !== undefined) {
		list.push({ label: 'דיווחים פתוחים', value: String(input.openCount) });
	}

	return list;
}

export function buildLibraryReportEmail(input: LibraryReportEmailInput): LibraryReportEmail {
	const title = clip(input.scenarioTitle, LIBRARY_REPORT_EMAIL.SUBJECT_TITLE_MAX) || '—';
	// The ASCII prefix is for a mail filter; the rest reads in Hebrew
	const subject = `[Agora library] דיווח חדש: ${KIND_LABEL[input.report.targetKind]} — ${title}`;
	const list = rows(input);

	const htmlRows = list
		.map(
			(row) =>
				`<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(
					row.label,
				)}</td><td style="padding:4px 0;white-space:pre-wrap;">${escapeHtml(row.value)}</td></tr>`,
		)
		.join('');
	const url = escapeHtml(input.queueUrl);
	const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
	<h2 style="margin:0 0 16px;">דיווח חדש בספריית התרחישים</h2>
	<table style="border-collapse:collapse;font-size:14px;color:#333;margin:0 0 20px;">${htmlRows}</table>
	<p style="margin:0 0 8px;"><a href="${url}">לתור הדיווחים בניהול הספרייה</a></p>
	<p style="margin:0;color:#888;font-size:12px;">דיווח אינו מסתיר דבר: ההחלטה שלכם, בתור.</p>
</body>
</html>`;

	const text = [
		'דיווח חדש בספריית התרחישים',
		'',
		...list.map((row) => `${row.label}: ${row.value}`),
		'',
		`לתור הדיווחים: ${input.queueUrl}`,
		'',
	].join('\n');

	return { subject, html, text };
}

/**
 * Who gets the letter: `AGORA_LIBRARY_REPORT_RECIPIENTS` (comma-separated)
 * when set, else the system admins' own addresses. Deduplicated, lower-cased,
 * anything without an `@` dropped.
 */
export function resolveReportRecipients(
	configured: string | undefined,
	adminEmails: readonly (string | undefined)[],
): string[] {
	const clean = (values: readonly (string | undefined)[]): string[] => [
		...new Set(
			values
				.map((entry) => (entry ?? '').trim().toLowerCase())
				.filter((entry) => entry.includes('@')),
		),
	];
	const fromEnv = clean((configured ?? '').split(','));

	return fromEnv.length > 0 ? fromEnv : clean(adminEmails);
}
