import { Access, Collections, Statement } from '@freedi/shared-types';
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { DB } from "../config";

interface Props {
	statement: Statement,
	membershipAccess: Access | null,
}

export async function setStatementMembership({ statement, membershipAccess }: Props): Promise<void> {
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
				console.error('Invalid membership access value:', membershipAccess);
				throw new Error(`Invalid membership access value: ${membershipAccess}`);
			}
			
			// Set specific membership access
			await updateDoc(statementRef, {
				membership: {
					access: membershipAccess,
				},
			});
		} else {
			console.error('Undefined membership access value');
			throw new Error('Membership access value is undefined');
		}
	} catch (error) {
		console.error('Error updating statement membership:', error);
		throw error;
	}
}