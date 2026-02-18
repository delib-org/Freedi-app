import React, { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import EditText, { EditTextProps } from './EditText';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { getParagraphsText } from '@/utils/paragraphUtils';

interface EditableStatementProps
	extends Omit<EditTextProps, 'value' | 'secondaryValue' | 'editable' | 'editing' | 'onSave'> {
	statement: Statement | undefined;
	showDescription?: boolean;
	onSaveSuccess?: () => void;
	onSaveError?: (error: Error) => void;
	forceEditable?: boolean;
	forceEditing?: boolean;
}

const EditableStatement: FC<EditableStatementProps> = ({
	statement,
	showDescription = true,
	onSaveSuccess,
	onSaveError,
	forceEditable = false,
	forceEditing = false,
	variant = 'both',
	...editTextProps
}) => {
	const { canEdit } = useEditPermission(statement);
	const isEditable = forceEditable || canEdit;

	if (!statement) return null;

	const handleSave = async (primary: string) => {
		try {
			if (!statement) throw new Error('Statement is undefined');

			const title = variant === 'description' ? statement.statement : primary;

			await updateStatementText(statement, title);
			onSaveSuccess?.();
		} catch (error) {
			console.error('Error updating statement:', error);
			onSaveError?.(error as Error);
		}
	};

	const effectiveVariant = showDescription ? variant : 'statement';
	const paragraphsText = getParagraphsText(statement.paragraphs);

	return (
		<EditText
			value={statement.statement || ''}
			secondaryValue={paragraphsText}
			editable={isEditable}
			editing={forceEditing}
			onSave={handleSave}
			variant={effectiveVariant}
			statementObj={statement}
			{...editTextProps}
		/>
	);
};

export default EditableStatement;
