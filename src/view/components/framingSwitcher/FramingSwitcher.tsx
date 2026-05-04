import { FC, useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useActiveFraming } from '@/controllers/hooks/useActiveFraming';
import { FramingMode } from '@/redux/framings/framingsSlice';
import styles from './FramingSwitcher.module.scss';

interface FramingSwitcherProps {
	parentId: string | undefined;
	className?: string;
}

interface ModeOption {
	mode: FramingMode;
	label: string;
	description: string;
}

const FramingSwitcher: FC<FramingSwitcherProps> = ({ parentId, className }) => {
	const { t } = useTranslation();
	const { mode, setMode, availableModes, isLoading } = useActiveFraming(parentId);

	const options = useMemo<ModeOption[]>(
		() => [
			{
				mode: FramingMode.regular,
				label: t('Regular'),
				description: t('Show all suggestions as a flat list'),
			},
			{
				mode: FramingMode.semantic,
				label: t('Semantic'),
				description: t('Group by semantic clustering (k-means on embeddings)'),
			},
			{
				mode: FramingMode.topic,
				label: t('Topic'),
				description: t('Group by topic clustering (LLM-derived themes)'),
			},
		],
		[t],
	);

	if (!parentId) return null;

	return (
		<div
			className={clsx(styles.framingSwitcher, className)}
			role="group"
			aria-label={t('View grouping')}
		>
			{options.map((opt) => {
				const enabled = availableModes.includes(opt.mode);
				const active = mode === opt.mode;

				return (
					<button
						key={opt.mode}
						type="button"
						className={clsx(
							styles.chip,
							active && styles['chip--active'],
							!enabled && styles['chip--disabled'],
						)}
						onClick={() => enabled && setMode(opt.mode)}
						disabled={!enabled || isLoading}
						title={enabled ? opt.description : t('No clustering of this type available — run it from settings first')}
						aria-pressed={active}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
};

export default FramingSwitcher;
