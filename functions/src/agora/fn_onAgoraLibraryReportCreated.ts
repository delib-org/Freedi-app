import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from '../db';
import {
	AgoraLibraryReport,
	AgoraScenarioPost,
	AgoraScenarioRating,
	AgoraTopicPackage,
	Collections,
	functionConfig,
} from '@freedi/shared-types';
import { getEmailTransporter } from '../utils/emailTransporter';
import { logError } from '../utils/errorHandling';
import { resolveApproval } from './libraryAccess';
import {
	LibraryReporterRole,
	buildLibraryReportEmail,
	libraryQueueUrl,
	resolveReportRecipients,
} from './libraryReportEmail';

/** The review's or post's own words, when the report is about one */
async function targetText(report: AgoraLibraryReport): Promise<string | undefined> {
	if (report.targetKind === 'review') {
		const snap = await db.collection(Collections.agoraScenarioRatings).doc(report.targetId).get();

		return (snap.data() as AgoraScenarioRating | undefined)?.text;
	}
	if (report.targetKind === 'post') {
		const snap = await db.collection(Collections.agoraScenarioPosts).doc(report.targetId).get();

		return (snap.data() as AgoraScenarioPost | undefined)?.text;
	}

	return undefined;
}

async function reporterRole(uid: string): Promise<LibraryReporterRole> {
	try {
		return (await resolveApproval(uid)).via ?? 'unknown';
	} catch {
		return 'unknown';
	}
}

async function adminEmails(): Promise<string[]> {
	const snap = await db.collection(Collections.users).where('systemAdmin', '==', true).get();

	return snap.docs
		.map((doc) => doc.get('email') as unknown)
		.filter((email): email is string => typeof email === 'string');
}

/**
 * A teacher filed a library report: tell the system admins by email.
 *
 * The report already sits in the queue (`/teach/library/admin`, which also
 * shows a count badge on its menu entry); this letter is so that someone
 * looks. Best effort: a missing mail account or a send failure is logged and
 * the report stays exactly where it is. Fires once per report — the report id
 * is one-per-teacher-per-target, so a repeat report creates nothing.
 */
export const onAgoraLibraryReportCreated = onDocumentCreated(
	{ document: `${Collections.agoraLibraryReports}/{reportId}`, region: functionConfig.region },
	async (event) => {
		const report = event.data?.data() as AgoraLibraryReport | undefined;
		if (!report || report.status !== 'open') return;

		try {
			const [pkgSnap, text, role, recipients, openSnap] = await Promise.all([
				db.collection(Collections.agoraTopicPackages).doc(report.scenarioId).get(),
				targetText(report),
				reporterRole(report.reporterId),
				adminEmails().then((emails) =>
					resolveReportRecipients(process.env.AGORA_LIBRARY_REPORT_RECIPIENTS, emails),
				),
				db.collection(Collections.agoraLibraryReports).where('status', '==', 'open').count().get(),
			]);
			if (recipients.length === 0) {
				logger.warn('[libraryReport] No admin address to tell', { reportId: report.reportId });

				return;
			}
			const transporter = await getEmailTransporter();
			if (!transporter) {
				logger.warn('[libraryReport] No mail account; report queued, not emailed', {
					reportId: report.reportId,
				});

				return;
			}

			const letter = buildLibraryReportEmail({
				report,
				scenarioTitle: (pkgSnap.data() as AgoraTopicPackage | undefined)?.title ?? '',
				targetText: text,
				reporterRole: role,
				openCount: openSnap.data().count,
				queueUrl: libraryQueueUrl(process.env.AGORA_APP_URL),
			});
			await transporter.sendMail({
				from: process.env.EMAIL_USER,
				// Admins do not see each other's addresses
				to: process.env.EMAIL_USER,
				bcc: recipients,
				subject: letter.subject,
				html: letter.html,
				text: letter.text,
			});
			logger.info('[libraryReport] Admins emailed', {
				reportId: report.reportId,
				recipients: recipients.length,
			});
		} catch (error) {
			logError(error, {
				operation: 'agora.onLibraryReportCreated',
				metadata: { reportId: report.reportId, targetKind: report.targetKind },
			});
		}
	},
);
