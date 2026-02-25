import { Access, Collections, Statement } from '@freedi/shared-types';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { DB } from '../config';
import { logError } from '@/utils/errorHandling';

interface Props {
	statement: Statement;
	membershipAccess: Access | null;
}

export async function setStatementMembership({
	statement,
	membershipAccess,
}: Props): Promise<void> {
	try {
		if (!statement) return;

		const statementRef = doc(DB, Collections.statements, statement.statementId);

		if (membershipAccess === null) {
			// Clear membership to inherit from parent
			await updateDoc(statementRef, {
				membership: deleteField(),
			});
		} else if (membershipAccess) {
			// Validate that membershipAccess is defined and valid
			if (!Object.values(Access).includes(membershipAccess)) {
				logError(membershipAccess, {
					operation: 'statements.setStatementMembership.setStatementMembership',
					metadata: { message: 'Invalid membership access value:' },
				});
				throw new Error(`Invalid membership access value: ${membershipAccess}`);
			}

			// Set specific membership access
			await updateDoc(statementRef, {
				membership: {
					access: membershipAccess,
				},
			});
		} else {
			logError(new Error('Undefined membership access value'), {
				operation: 'statements.setStatementMembership.setStatementMembership',
			});
			throw new Error('Membership access value is undefined');
		}
	} catch (error) {
		logError(error, {
			operation: 'statements.setStatementMembership.unknown',
			metadata: { message: 'Error updating statement membership:' },
		});
		throw error;
	}
}
