import { Screen } from '@freedi/shared-types';
import { ReactNode } from 'react';
import { Translate } from './ThinkingSpace';
import styles from './MapExplorer.module.scss';

export const mapViews = [
	{
		id: Screen.mindMap,
		group: 'Understand the structure',
		title: 'Mind map',
		description: 'Follow questions, solutions and their connections.',
	},
	{
		id: Screen.subQuestionsMap,
		group: 'Understand the structure',
		title: 'Sub-question map',
		description: 'Follow the questions that help answer this question.',
	},
	{
		id: Screen.clusterBoard,
		group: 'Explore the solutions',
		title: 'Themes & synthesis',
		description:
			'Topics group related solutions. Syntheses combine equivalent wording of the same solution.',
	},
	{
		id: Screen.agreementMap,
		group: 'Understand agreement',
		title: 'Agreement triangle',
		description: 'Compare support, opposition and the amount of evaluation.',
	},
	{
		id: Screen.polarizationIndex,
		group: 'Understand agreement',
		title: 'Polarization',
		description: 'See where evaluations converge or differ.',
	},
] as const;
export type MapViewId = (typeof mapViews)[number]['id'];
export default function MapExplorer({
	active,
	onSelect,
	t,
	children,
}: {
	active: MapViewId;
	onSelect: (id: MapViewId) => void;
	t: Translate;
	children: ReactNode;
}) {
	const current = mapViews.find((view) => view.id === active)!;

	return (
		<section className={styles.explorer}>
			<nav className={styles.explorer__nav} aria-label={t('Map views')}>
				{[...new Set(mapViews.map((view) => view.group))].map((group) => (
					<div key={group}>
						<span>{t(group)}</span>
						<div>
							{mapViews
								.filter((view) => view.group === group)
								.map((view) => (
									<button
										key={view.id}
										aria-pressed={active === view.id}
										onClick={() => onSelect(view.id)}
									>
										{t(view.title)}
									</button>
								))}
						</div>
					</div>
				))}
			</nav>
			<div className={styles.explorer__heading}>
				<h2>{t(current.title)}</h2>
				<p>{t(current.description)}</p>
			</div>
			<div className={styles.explorer__canvas}>{children}</div>
		</section>
	);
}
