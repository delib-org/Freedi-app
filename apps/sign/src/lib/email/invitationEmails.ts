import { AdminPermissionLevel } from '@freedi/shared-types';
import { getEmailTransporter, getFromAddress } from './transporter';
import { logger } from '@/lib/utils/logger';

/** Escape user-supplied values before interpolating into email HTML. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Hebrew label for a permission level. */
function permissionLabelHe(level: AdminPermissionLevel): string {
	return level === AdminPermissionLevel.admin ? 'מנהל/ת' : 'צופה';
}

/**
 * Wrap body content in a branded, right-to-left (Hebrew) HTML shell.
 */
function buildHtmlShell(innerHtml: string): string {
	return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#2d3748;max-width:600px;margin:0 auto;padding:24px;" dir="rtl">
    <div style="background:#ffffff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      ${innerHtml}
    </div>
    <p style="font-size:12px;color:#a0aec0;text-align:center;margin-top:18px;">WizCol Sign</p>
  </div>
</body>
</html>`;
}

interface InviteeEmailParams {
	to: string;
	inviteLink: string;
	permissionLevel: AdminPermissionLevel;
	inviterName: string;
	documentTitle: string;
}

/**
 * Send the invitation email to the invitee, containing a one-click accept link.
 * Returns true on success, false if skipped (no credentials) or on failure —
 * never throws, so invitation creation is not blocked by email delivery.
 */
export async function sendInvitationEmailToInvitee(params: InviteeEmailParams): Promise<boolean> {
	const transporter = getEmailTransporter();
	if (!transporter) return false;

	const role = permissionLabelHe(params.permissionLevel);
	const title = escapeHtml(params.documentTitle);
	const inviter = escapeHtml(params.inviterName);

	const inner = `
    <p style="font-size:16px;margin:0 0 16px;">שלום,</p>
    <p style="font-size:16px;margin:0 0 16px;">
      ${inviter} הזמין/ה אותך לנהל את המסמך <strong>"${title}"</strong>
      ב-WizCol Sign בהרשאת <strong>${role}</strong>.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${params.inviteLink}" style="background:rgb(132,187,247);color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:16px;">
        קבל/י את ההזמנה
      </a>
    </div>
    <p style="font-size:14px;color:#718096;margin:0 0 8px;">
      יש להתחבר עם חשבון Google של כתובת הדוא"ל הזו כדי לקבל את ההרשאה.
    </p>
    <p style="font-size:13px;color:#a0aec0;margin:16px 0 0;">
      אם הכפתור אינו פועל, יש להעתיק את הקישור הבא לדפדפן:<br />
      <a href="${params.inviteLink}" style="color:#4299e1;word-break:break-all;">${escapeHtml(params.inviteLink)}</a>
    </p>`;

	try {
		await transporter.sendMail({
			from: getFromAddress(),
			to: params.to,
			subject: `הוזמנת לנהל מסמך ב-WizCol Sign`,
			html: buildHtmlShell(inner),
		});

		return true;
	} catch (error) {
		logger.error('[email] Failed to send invitee invitation email:', error);

		return false;
	}
}

interface AdminConfirmationParams {
	to: string;
	adminName: string;
	inviteeEmail: string;
	permissionLevel: AdminPermissionLevel;
	documentTitle: string;
}

/**
 * Send a confirmation email to the admin who created the invitation, noting who
 * was invited and at what permission level. Returns true on success, false if
 * skipped/failed — never throws.
 */
export async function sendInvitationConfirmationToAdmin(params: AdminConfirmationParams): Promise<boolean> {
	const transporter = getEmailTransporter();
	if (!transporter) return false;

	const role = permissionLabelHe(params.permissionLevel);
	const title = escapeHtml(params.documentTitle);
	const admin = escapeHtml(params.adminName);
	const invitee = escapeHtml(params.inviteeEmail);

	const inner = `
    <p style="font-size:16px;margin:0 0 16px;">שלום ${admin},</p>
    <p style="font-size:16px;margin:0 0 16px;">
      הזמנה נשלחה בהצלחה אל <strong>${invitee}</strong>
      לניהול המסמך <strong>"${title}"</strong> בהרשאת <strong>${role}</strong>.
    </p>
    <p style="font-size:14px;color:#718096;margin:0;">
      המוזמן/ת יקבל/תקבל את ההרשאה לאחר התחברות עם חשבון Google של אותה כתובת דוא"ל.
    </p>`;

	try {
		await transporter.sendMail({
			from: getFromAddress(),
			to: params.to,
			subject: `ההזמנה נשלחה — ${title}`,
			html: buildHtmlShell(inner),
		});

		return true;
	} catch (error) {
		logger.error('[email] Failed to send admin confirmation email:', error);

		return false;
	}
}
