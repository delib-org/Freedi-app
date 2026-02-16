import React, { FC, useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { Statement } from '@freedi/shared-types';
import Save from '@/assets/icons/saveIcon.svg?react';
import Text from '../text/Text';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface EditTextProps {
	value: string;
	secondaryValue?: string;
	editable?: boolean;
	editing?: boolean;
	onSave?: (primary: string, secondary?: string) => void;
	variant?: 'statement' | 'description' | 'both';
	className?: string;
	inputClassName?: string;
	textClassName?: string;
	saveButtonClassName?: string;
	containerClassName?: string;
	multiline?: boolean;
	placeholder?: string;
	secondaryPlaceholder?: string;
	required?: boolean;
	autoFocus?: boolean;
	fontSize?: string;
	onEditStart?: () => void;
	onEditEnd?: () => void;
	/** Pass the full statement object to enable paragraph rendering */
	statementObj?: Statement;
}

const EditText: FC<EditTextProps> = ({
	value,
	secondaryValue = '',
	editable = false,
	editing = false,
	onSave,
	variant = 'both',
	className = '',
	inputClassName = '',
	textClassName = '',
	saveButtonClassName = '',
	containerClassName = '',
	multiline = false,
	placeholder = 'Enter text',
	secondaryPlaceholder = 'Enter description',
	required = false,
	autoFocus = true,
	fontSize,
	onEditStart,
	onEditEnd,
	statementObj,
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [primaryText, setPrimaryText] = useState(value);
	const [secondaryText, setSecondaryText] = useState(secondaryValue);
	const [rawText, setRawText] = useState(''); // Track the raw text during editing
	const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
	const { dir: direction } = useTranslation();
	const align = direction === 'ltr' ? 'left' : 'right';

	useEffect(() => {
		setPrimaryText(value);
	}, [value]);

	useEffect(() => {
		setSecondaryText(secondaryValue);
	}, [secondaryValue]);

	useEffect(() => {
		if (editing && !isEditing) {
			handleStartEdit();
		} else if (!editing && isEditing) {
			handleCancel();
		}
	}, [editing]);

	useEffect(() => {
		if (isEditing && autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isEditing, autoFocus]);

	// Auto-resize textarea based on content
	useEffect(() => {
		if (isEditing && multiline && inputRef.current && 'style' in inputRef.current) {
			const textarea = inputRef.current as HTMLTextAreaElement;
			// Reset height to auto to get the correct scrollHeight
			textarea.style.height = 'auto';
			// Set height to scrollHeight
			textarea.style.height = `${textarea.scrollHeight}px`;
		}
	}, [isEditing, multiline, rawText]);

	const handleStartEdit = () => {
		if (!editable && !editing) return;
		// Initialize raw text with current values based on variant
		let initialText = value;
		if (variant === 'description') {
			initialText = secondaryValue;
		} else if (variant === 'both' && secondaryValue) {
			initialText = `${value}\n${secondaryValue}`;
		}
		setRawText(initialText);
		setIsEditing(true);
		onEditStart?.();
	};

	const handleSave = () => {
		try {
			if (required && !primaryText.trim()) return;

			onSave?.(primaryText, secondaryText);
			setRawText('');
			setIsEditing(false);
			onEditEnd?.();
		} catch (error) {
			console.error('Error saving text:', error);
		}
	};

	const handleCancel = () => {
		setPrimaryText(value);
		setSecondaryText(secondaryValue);
		setRawText('');
		setIsEditing(false);
		onEditEnd?.();
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !multiline) {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Escape') {
			handleCancel();
		}
	};

	const handleTextAreaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			handleCancel();
		}
		// Allow Enter and Shift+Enter to create new lines naturally
	};

	const handleTextAreaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value;
		setRawText(value); // Keep the raw text with all newlines

		// Handle based on variant
		if (variant === 'description') {
			// For description variant, everything goes to secondaryText
			setSecondaryText(value);
		} else {
			// Split for saving purposes (for 'both' variant)
			const lines = value.split('\n');
			const firstLine = lines[0] || '';
			const restLines = lines.slice(1).join('\n');
			setPrimaryText(firstLine);
			setSecondaryText(restLines);
		}

		// Auto-resize the textarea
		const textarea = e.target;
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	};

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (variant !== 'description') {
			setPrimaryText(e.target.value);
		}
	};

	if (!isEditing) {
		const displayContent = (
			<div
				className={textClassName}
				style={{
					direction,
					textAlign: align,
					cursor: editable && !editing ? 'pointer' : 'default',
				}}
				onClick={editable && !editing ? handleStartEdit : undefined}
				role={editable && !editing ? 'button' : undefined}
				tabIndex={editable && !editing ? 0 : undefined}
				onKeyDown={editable && !editing ? (e) => e.key === 'Enter' && handleStartEdit() : undefined}
			>
				{variant === 'description' ? (
					<Text description={secondaryText} fontSize={fontSize} statementObj={statementObj} />
				) : variant === 'statement' ? (
					<Text statement={primaryText} fontSize={fontSize} statementObj={statementObj} />
				) : (
					<Text
						statement={primaryText}
						description={secondaryText}
						fontSize={fontSize}
						statementObj={statementObj}
					/>
				)}
			</div>
		);

		return <div className={className}>{displayContent}</div>;
	}

	const renderEditContent = () => {
		if (multiline) {
			return (
				<textarea
					ref={inputRef as React.RefObject<HTMLTextAreaElement>}
					className={inputClassName}
					style={{
						direction,
						textAlign: align,
						minHeight: '3rem',
						overflow: 'hidden',
						resize: 'none',
						fontSize: fontSize || 'inherit',
						width: '100%',
						boxSizing: 'border-box',
					}}
					value={rawText}
					onChange={handleTextAreaChange}
					onKeyDown={handleTextAreaKeyDown}
					placeholder={placeholder}
					required={required}
					data-cy="edit-text-textarea"
				/>
			);
		}

		// Non-multiline editing
		if (variant === 'both') {
			return (
				<div className={containerClassName}>
					<input
						ref={inputRef as React.RefObject<HTMLInputElement>}
						className={inputClassName}
						style={{ direction, textAlign: align }}
						type="text"
						value={primaryText}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						placeholder={placeholder}
						required={required}
						data-cy="edit-text-primary"
					/>
					<textarea
						className={inputClassName}
						style={{
							direction,
							textAlign: align,
							minHeight: '3rem',
							overflow: 'hidden',
							resize: 'none',
						}}
						value={secondaryText}
						onChange={(e) => {
							setSecondaryText(e.target.value);
							// Auto-resize
							e.target.style.height = 'auto';
							e.target.style.height = `${e.target.scrollHeight}px`;
						}}
						onKeyDown={handleTextAreaKeyDown}
						placeholder={secondaryPlaceholder}
						data-cy="edit-text-secondary"
					/>
				</div>
			);
		}

		if (variant === 'description') {
			return (
				<textarea
					ref={inputRef as React.RefObject<HTMLTextAreaElement>}
					className={inputClassName}
					style={{
						direction,
						textAlign: align,
						minHeight: '3rem',
						overflow: 'hidden',
						resize: 'none',
					}}
					value={secondaryText}
					onChange={(e) => {
						setSecondaryText(e.target.value);
						// Auto-resize
						e.target.style.height = 'auto';
						e.target.style.height = `${e.target.scrollHeight}px`;
					}}
					onKeyDown={handleTextAreaKeyDown}
					placeholder={secondaryPlaceholder}
					data-cy="edit-text-description"
				/>
			);
		}

		return (
			<input
				ref={inputRef as React.RefObject<HTMLInputElement>}
				className={inputClassName}
				style={{ direction, textAlign: align }}
				type="text"
				value={primaryText}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				required={required}
				data-cy="edit-text-input"
			/>
		);
	};

	return (
		<div className={className}>
			<div className={containerClassName}>
				{renderEditContent()}
				<div className={saveButtonClassName}>
					<button onClick={handleSave} aria-label="Save" type="button">
						<Save />
					</button>
					<button onClick={handleCancel} aria-label="Cancel" type="button">
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default EditText;
