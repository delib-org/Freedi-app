import { Collections, VotingSettings, VotingSettingsSchema } from '@freedi/shared-types';
import { doc, updateDoc } from 'firebase/firestore';
import { DB } from '../config';
import { safeParse } from 'valibot';

export async function setVotingSettingsToDB({
	statementId,
	votingSettings,
}: {
	statementId: string;
	votingSettings: VotingSettings;
}) {
	console.info('Updating voting settings for statement:', statementId);
	console.info('New voting settings:', votingSettings);
	try {
		// Validate the voting settings before updating
		const validationResult = safeParse(VotingSettingsSchema, votingSettings);

		if (!validationResult.success) {
			console.error('Invalid voting settings:', validationResult.issues);
			throw new Error(
				`Validation failed: ${validationResult.issues.map((i) => i.message).join(', ')}`,
			);
		}

		const statementRef = doc(DB, Collections.statements, statementId);

		await updateDoc(statementRef, {
			votingSettings: validationResult.output,
		});

		console.info('Voting settings updated successfully');
	} catch (error) {
		console.error('Error updating voting settings:', error);
	}
}
