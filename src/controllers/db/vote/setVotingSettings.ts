import { Collections, VotingSettings, VotingSettingsSchema } from '@freedi/shared-types';
import { doc, updateDoc } from 'firebase/firestore';
import { DB } from '../config';
import { safeParse } from 'valibot';
import { logError } from '@/utils/errorHandling';

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
			logError(new Error('Invalid voting settings:'), {
				operation: 'vote.setVotingSettings.setVotingSettingsToDB',
				metadata: { detail: validationResult.issues },
			});
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
		logError(error, {
			operation: 'vote.setVotingSettings.setVotingSettingsToDB',
			metadata: { message: 'Error updating voting settings:' },
		});
	}
}
