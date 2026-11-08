import React, { useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './Agreement.module.scss';

/** How many ideas show before "Show all {n}" — keeps a long leftover group from burying the page. */
export const OTHER_IDEAS_PREVIEW_COUNT = 6;
const OTHER_IDEAS_ANCHOR = 'other-ideas';
const OTHER_IDEAS_HEADING_ID = 'other-ideas-heading';

interface OtherIdeasSectionProps {
	atoms: Statement[];
	renderAtom: (atom: Statement) => React.ReactNode;
}

/** The ideas no theme holds. Same cards as inside themes; equal in status to a theme. */
export default function OtherIdeasSection({ atoms, renderAtom }: OtherIdeasSectionProps) {
	const { t } = useTranslation();
	const [showAll, setShowAll] = useState(false);

	if (atoms.length === 0) return null;

	const shown = showAll ? atoms : atoms.slice(0, OTHER_IDEAS_PREVIEW_COUNT);
	const hiddenCount = atoms.length - shown.length;

	return (
		<section
			id={OTHER_IDEAS_ANCHOR}
			className={styles.journey__section}
			aria-labelledby={OTHER_IDEAS_HEADING_ID}
		>
			<h3 id={OTHER_IDEAS_HEADING_ID}>
				{t('Other ideas')} · {t('{n} ideas').replace('{n}', String(atoms.length))}
			</h3>
			<p className={styles.journey__muted}>{t('Ideas that stand on their own.')}</p>
			{shown.map(renderAtom)}
			{hiddenCount > 0 && (
				<div className={styles.journey__actions}>
					<button onClick={() => setShowAll(true)}>
						{t('Show all {n}').replace('{n}', String(atoms.length))}
					</button>
				</div>
			)}
		</section>
	);
}
