import React, { FC } from 'react';
import { Statement } from 'delib-npm';
import EditText, { EditTextProps } from './EditText';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { updateStatementText } from '@/controllers/db/statements/setStatements';

interface EditableDescriptionProps extends Omit<EditTextProps, 'value' | 'secondaryValue' | 'editable' | 'onSave' | 'variant'> {
	statement: Statement | undefined;
	onSaveSuccess?: () => void;
	onSaveError?: (error: Error) => void;
	forceEditable?: boolean;
}

const EditableDescription: FC<EditableDescriptionProps> = ({
	statement,
	onSaveSuccess,
	onSaveError,
	forceEditable = false,
	...editTextProps
}) => {
	const { canEdit } = useEditPermission(statement);
	const isEditable = forceEditable || canEdit;

	if (!statement) return null;

	const handleSave = async (_primary: string, secondary?: string) => {
		try {
			if (!statement) throw new Error('Statement is undefined');
			
			await updateStatementText(statement, statement.statement, secondary || '');
			onSaveSuccess?.();
		} catch (error) {
			console.error('Error updating statement description:', error);
			onSaveError?.(error as Error);
		}
	};

	return (
		<EditText
			value={statement.statement || ''}
			secondaryValue={statement.description || ''}
			editable={isEditable}
			onSave={handleSave}
			variant="description"
			multiline={true}
			{...editTextProps}
		/>
	);
};

export default EditableDescription;