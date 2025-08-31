import React, { FC, useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from 'react';
import Save from '@/assets/icons/saveIcon.svg?react';
import Text from '../text/Text';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

export interface EditTextProps {
	value: string;
	secondaryValue?: string;
	editable?: boolean;
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
	onEditStart?: () => void;
	onEditEnd?: () => void;
}

const EditText: FC<EditTextProps> = ({
	value,
	secondaryValue = '',
	editable = false,
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
	onEditStart,
	onEditEnd
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [primaryText, setPrimaryText] = useState(value);
	const [secondaryText, setSecondaryText] = useState(secondaryValue);
	const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
	const { dir: direction } = useUserConfig();
	const align = direction === 'ltr' ? 'left' : 'right';

	useEffect(() => {
		setPrimaryText(value);
	}, [value]);

	useEffect(() => {
		setSecondaryText(secondaryValue);
	}, [secondaryValue]);

	useEffect(() => {
		if (isEditing && autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isEditing, autoFocus]);

	const handleStartEdit = () => {
		if (!editable) return;
		setIsEditing(true);
		onEditStart?.();
	};

	const handleSave = () => {
		try {
			if (required && !primaryText.trim()) return;
			
			const finalPrimary = variant === 'description' ? value : primaryText;
			const finalSecondary = variant === 'statement' ? secondaryValue : secondaryText;
			
			onSave?.(finalPrimary, finalSecondary);
			setIsEditing(false);
			onEditEnd?.();
		} catch (error) {
			console.error('Error saving text:', error);
		}
	};

	const handleCancel = () => {
		setPrimaryText(value);
		setSecondaryText(secondaryValue);
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

	const handleTextAreaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
		if (variant === 'both' && multiline) {
			const lines = e.target.value.split('\n');
			setPrimaryText(lines[0] || '');
			setSecondaryText(lines.slice(1).join('\n'));
		} else if (variant === 'statement') {
			setPrimaryText(e.target.value);
		} else {
			setSecondaryText(e.target.value);
		}
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
				style={{ direction, textAlign: align }}
				onClick={handleStartEdit}
				role={editable ? 'button' : undefined}
				tabIndex={editable ? 0 : undefined}
				onKeyDown={editable ? (e) => e.key === 'Enter' && handleStartEdit() : undefined}
			>
				{variant === 'statement' && <Text statement={primaryText} />}
				{variant === 'description' && <Text description={secondaryText} />}
				{variant === 'both' && <Text statement={primaryText} description={secondaryText} />}
			</div>
		);

		return <div className={className}>{displayContent}</div>;
	}

	const renderEditContent = () => {
		if (multiline) {
			const textAreaValue = variant === 'both' 
				? `${primaryText}${secondaryText ? '\n' + secondaryText : ''}`
				: variant === 'statement' 
					? primaryText 
					: secondaryText;

			return (
				<textarea
					ref={inputRef as React.RefObject<HTMLTextAreaElement>}
					className={inputClassName}
					style={{ direction, textAlign: align }}
					value={textAreaValue}
					onChange={handleTextAreaChange}
					placeholder={variant === 'description' ? secondaryPlaceholder : placeholder}
					required={required && variant !== 'description'}
					data-cy="edit-text-textarea"
				/>
			);
		}

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
						style={{ direction, textAlign: align }}
						value={secondaryText}
						onChange={(e) => setSecondaryText(e.target.value)}
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
					style={{ direction, textAlign: align }}
					value={secondaryText}
					onChange={(e) => setSecondaryText(e.target.value)}
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
				<button
					className={saveButtonClassName}
					onClick={handleSave}
					aria-label="Save"
					type="button"
				>
					<Save />
				</button>
				{editable && (
					<button
						className={saveButtonClassName}
						onClick={handleCancel}
						aria-label="Cancel"
						type="button"
					>
						Cancel
					</button>
				)}
			</div>
		</div>
	);
};

export default EditText;