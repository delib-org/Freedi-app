import { FC } from 'react';
import { RoutePrerequisite } from '@freedi/shared-types';
import type { RouteTarget } from '@freedi/event-core';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './RoutePicker.module.scss';

interface Props {
	target: RouteTarget;
	onSelect: (target: RouteTarget) => void;
	onStopMark: (target: RouteTarget) => void;
}

/** One destination row in the Route Picker, including disabled and
 *  already-marked states. Pure presentation — behavior lives in RoutePicker. */
const RouteTargetRow: FC<Props> = ({ target, onSelect, onStopMark }) => {
	const { t } = useTranslation();
	const { def, state, disabledReason } = target;
	const isDisabled = state === 'disabled';
	const badgeLabel =
		def.prerequisite === RoutePrerequisite.markDocument ? t('Document') : t('Active');

	return (
		<div className={styles.row + (isDisabled ? ` ${styles['row--disabled']}` : '')}>
			<button
				type="button"
				className={styles.row__main}
				onClick={() => onSelect(target)}
				disabled={isDisabled}
				aria-label={`${t(def.label)} — ${t('Links open in a new tab')}`}
			>
				<span className={styles.row__icon} aria-hidden="true">
					{def.icon}
				</span>
				<span className={styles.row__texts}>
					<span className={styles.row__label}>
						{t(def.label)}
						{state === 'alreadyMarked' && <span className={styles.row__badge}>● {badgeLabel}</span>}
					</span>
					<span className={styles.row__description}>
						{isDisabled && disabledReason ? t(disabledReason) : t(def.description)}
					</span>
				</span>
				{!isDisabled && (
					<span className={styles.row__chevron} aria-hidden="true">
						›
					</span>
				)}
			</button>
			{state === 'alreadyMarked' && (
				<button type="button" className={styles.row__stop} onClick={() => onStopMark(target)}>
					{def.prerequisite === RoutePrerequisite.markDocument
						? t('Stop being a document')
						: t('Turn off crowd consensus')}
				</button>
			)}
		</div>
	);
};

export default RouteTargetRow;
