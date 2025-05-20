import { logger } from 'firebase-functions/v1';
import * as nodemailer from 'nodemailer';

export function logBase(x: number, b: number) {
	return Math.log(x) / Math.log(b);
}

//get top selections from selections
export function getTopSelectionKeys(
	selections: { [key: string]: number },
	limit = 1,
): string[] {
	const sortedSelections = Object.entries(selections)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit);

	return sortedSelections.map(([key]) => key);
}

export const isEqualObjects = (objA: object | undefined, objB: object | undefined) => {
	return JSON.stringify(objA) === JSON.stringify(objB);
}

//mailer function

const user = process.env.BREVO_USER;
const pass = process.env.BREVO_PASSWORD;

if (!user || !pass) {
	logger.error('Brevo credentials are not set in environment variables');
}

const transporter = nodemailer.createTransport({
	host: 'smtp-relay.brevo.com',
	port: 587,
	secure: false, // true for 465, false for other ports
	auth: {
		user: user, // your Brevo account email
		pass: pass // your Brevo API/SMTP key
	}
});
export async function sendEmail({ to, subject, body }: { to: string, subject: string, body: string }) {
	// Send email logic here
	try {

		const mailOptions = {
			from: 'Freedi <tal.yaron@gmail.com>', // verified sender in Brevo
			to: to,
			subject: subject,
			html: body
		};

		const info = await transporter.sendMail(mailOptions);

		return { success: true, messageId: info.messageId };
	} catch (error) {

		logger.error('Error sending email:', error);

		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}

}