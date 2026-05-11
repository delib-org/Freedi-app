import React, { useEffect } from 'react';
import clsx from 'clsx';
import { Layers, Sparkles, Tags } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { FramingChipPipeline } from '@/view/components/atomic/molecules/FramingChip';

export interface FramingSheetOption {
	id: string;
	label: string;
	pipeline: FramingChipPipeline;
	description?: string;
	count?: number;
	disabled?: boolean;
	stale?: boolean;
}

export interface FramingSheetProps {
	open: boolean;
	options: FramingSheetOption[];
	activeId: string;
	onSelect: (id: string) => void;
	onClose: () => void;
	/** When set, renders the per-user override toggle below the list. */
	override?: {
		label: string;
		checked: boolean;
		onToggle: (next: boolean) => void;
	};
	title?: string;
}

function pipelineIcon(pipeline: FramingChipPipeline): React.ReactNode {
	switch (pipeline) {
		case 'synthesis':
			return <Sparkles size={14} aria-hidden />;
		case 'topic':
			return <Tags size={14} aria-hidden />;
		case 'semantic':
		case 'custom':
			return <Layers size={14} aria-hidden />;
		default:
			return null;
	}
}

const FramingSheet: React.FC<FramingSheetProps> = ({
	open,
	options,
	activeId,
	onSelect,
	onClose,
	override,
	title,
}) => {
	const { t } = useTranslation();

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);

		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	if (!open) return null;

	const sheetTitle = title ?? t('View as');

	return (
		<div className="framing-sheet" role="dialog" aria-modal aria-label={sheetTitle}>
			<button
				type="button"
				className="framing-sheet__backdrop"
				aria-label={t('Close')}
				onClick={onClose}
			/>
			<div className="framing-sheet__panel">
				<div className="framing-sheet__handle" aria-hidden />
				<h3 className="framing-sheet__title">{sheetTitle}</h3>
				<ul className="framing-sheet__list" role="radiogroup" aria-label={sheetTitle}>
					{options.map((opt) => {
						const isActive = opt.id === activeId;
						const optionClasses = clsx(
							'framing-sheet__option',
							isActive && 'framing-sheet__option--active',
							opt.disabled && 'framing-sheet__option--disabled',
						);
						const radioClasses = clsx(
							'framing-sheet__radio',
							isActive && 'framing-sheet__radio--active',
						);

						return (
							<li key={opt.id}>
								<button
									type="button"
									role="radio"
									aria-checked={isActive}
									className={optionClasses}
									disabled={opt.disabled}
									onClick={() => {
										if (opt.disabled) return;
										onSelect(opt.id);
									}}
								>
									<span className={radioClasses} aria-hidden />
									<span className="framing-sheet__option-text">
										<span className="framing-sheet__option-title">
											{pipelineIcon(opt.pipeline)}
											<span>{opt.label}</span>
											{typeof opt.count === 'number' && <span aria-hidden>· {opt.count}</span>}
										</span>
										{opt.description && (
											<span className="framing-sheet__option-meta">{opt.description}</span>
										)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
				{override && (
					<>
						<hr className="framing-sheet__divider" aria-hidden />
						<label className="framing-sheet__override">
							<input
								type="checkbox"
								checked={override.checked}
								onChange={(e) => override.onToggle(e.target.checked)}
							/>
							<span>{override.label}</span>
						</label>
					</>
				)}
				<div className="framing-sheet__actions">
					<button type="button" className="framing-sheet__done" onClick={onClose}>
						{t('Done')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default FramingSheet;
