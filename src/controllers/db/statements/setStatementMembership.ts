import { Access, Collections, Statement } from "delib-npm";
import { doc, updateDoc } from "firebase/firestore";
import { DB } from "../config";

interface Props {
	statement: Statement,
	membershipAccess: Access,
}

export async function setStatementMembership({ statement, membershipAccess }: Props): Promise<void> {
	try {
		if (!statement) {
			console.warn('No statement provided for membership update.');
			return;
		};
		const statementRef = doc(DB, Collections.statements, statement.statementId);
		updateDoc(statementRef, {
			membership: {
				access: membershipAccess,
			},
		});
	} catch (error) {
		console.error('Error updating statement membership:', error);
		throw error;
	}
}