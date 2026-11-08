import React, { useId } from 'react';
import clsx from 'clsx';
import Loader from '@/view/components/atomic/atoms/Loader';

/**
 * AccessPicker Molecule - Atomic Design System
 *
 * Who can join: a native radio group (`fieldset` + `legend`), one label and
 * one hint per level, the hint tied to its radio by `aria-describedby`.
 * The name is the label alone (`aria-labelledby`), so the hint is read once.
 * Arrow keys move within the group natively. While `isInherited` every radio
 * is disabled and shows the group's value; the InheritanceSwitch above is the
 * only live control. Styling lives in src/view/style/molecules/_access-picker.scss.
 */
export interface AccessPickerOption<T extends string> {
	value: T;
	label: string;
	hint: string;
}

export interface AccessPickerProps<T extends string> {
	legend: string;
	options: ReadonlyArray<AccessPickerOption<T>>;
	value: T;
	onChange: (value: T) => void;
	isInherited?: boolean;
	/** The value being saved right now; its row shows a spinner. */
	savingValue?: T | null;
	className?: string;
}

function AccessPicker<T extends string>({
	legend,
	options,
	value,
	onChange,
	isInherited = false,
	savingValue = null,
	className,
}: AccessPickerProps<T>): React.ReactElement {
	const baseId = useId();
	const isSaving = savingValue !== null;

	return (
		<fieldset
			className={clsx(
				'access-picker',
				isSaving && 'access-picker--saving',
				isInherited && 'access-picker--inherited',
				className,
			)}
			aria-busy={isSaving || undefined}
		>
			<legend className="access-picker__legend">{legend}</legend>
			{options.map((option) => {
				const labelId = `${baseId}-${option.value}-label`;
				const hintId = `${baseId}-${option.value}-hint`;
				const isChecked = option.value === value;
				const isBusy = option.value === savingValue;

				return (
					<label
						key={option.value}
						className={clsx(
							'access-picker__option',
							isChecked && 'access-picker__option--checked',
							isBusy && 'access-picker__option--busy',
						)}
					>
						<input
							className="access-picker__input"
							type="radio"
							name={baseId}
							value={option.value}
							checked={isChecked}
							disabled={isInherited}
							aria-labelledby={labelId}
							aria-describedby={hintId}
							onChange={() => onChange(option.value)}
						/>
						<span className="access-picker__indicator" aria-hidden="true" />
						<span className="access-picker__text">
							<span className="access-picker__label" id={labelId}>
								{option.label}
							</span>
							<span className="access-picker__hint" id={hintId}>
								{option.hint}
							</span>
						</span>
						{isBusy && (
							<span className="access-picker__spinner">
								<Loader size="small" />
							</span>
						)}
					</label>
				);
			})}
		</fieldset>
	);
}

export default AccessPicker;
