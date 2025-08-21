import { Access, Collections, Statement } from "delib-npm";
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
		} else {
			// Set specific membership access
			await updateDoc(statementRef, {
				membership: {
					access: membershipAccess,
				},
			});
		}
	} catch (error) {
		console.error('Error updating statement membership:', error);
		throw error;
	}
}