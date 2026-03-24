import { FC, useCallback } from 'react';
import { updateDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import EditText from '@/view/components/edit/EditText';

interface FacilitatorBriefProps {
	statement: Statement;
	isAdmin: boolean;
}

const FacilitatorBrief: FC<FacilitatorBriefProps> = ({ statement, isAdmin }) => {
	const handleSave = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (trimmed === (statement.brief ?? '')) return;

		try {
			const ref = createStatementRef(statement.statementId);
			await updateDoc(ref, { brief: trimmed, lastUpdate: getCurrentTimestamp() });
		} catch (error) {
			logError(error, {
				operation: 'compound.updateFacilitatorBrief',
				statementId: statement.statementId,
			});
		}
	}, [statement]);

	return (
		<EditText
			value={statement.brief ?? ''}
			editable={isAdmin}
			onSave={handleSave}
			variant="statement"
			multiline={true}
		/>
	);
};

export default FacilitatorBrief;
