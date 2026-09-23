import { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useGroupMembers } from '@/controllers/hooks/useGroupMembers';
import { Sheet } from '@/view/components/atomic/molecules/Sheet';
import styles from './SuggestionCard.module.scss';

interface MergeBadgeProps {
	/** A merged answer: `isCluster` with the ids of the originals it represents. */
	cluster: Statement;
}

/**
 * "Merged from {n} similar answers · show the originals". Opens a sheet that
 * lists the originals (store first, missing ones fetched on open). Un-merging
 * stays where it already lives — the host's card menu / grouped card.
 */
const MergeBadge: FC<MergeBadgeProps> = ({ cluster }) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const count = cluster.integratedOptions?.length ?? 0;
	const { members, isLoading } = useGroupMembers(cluster.statementId, isOpen);

	return (
		<>
			<div className={styles.mergeBadge} data-testid="merge-badge">
				<span className={styles.mergeDot} aria-hidden="true" />
				<span>{t('Merged from {n} similar answers').replace('{n}', String(count))}</span>
				<span aria-hidden="true">·</span>
				<button
					type="button"
					className={styles.mergeLink}
					onClick={() => setIsOpen(true)}
					data-testid="merge-badge-show-originals"
				>
					{t('Show the originals')}
				</button>
			</div>
			<Sheet
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				title={t('Original answers')}
				id={`merge-originals-${cluster.statementId}`}
			>
				{members.length === 0 ? (
					<p className={styles.originalsNote}>
						{isLoading ? t('Loading...') : t('No originals found.')}
					</p>
				) : (
					<ul className={styles.originals}>
						{members.map((member) => (
							<li key={member.statementId} className={styles.original}>
								{member.statement}
							</li>
						))}
					</ul>
				)}
			</Sheet>
		</>
	);
};

export default MergeBadge;
