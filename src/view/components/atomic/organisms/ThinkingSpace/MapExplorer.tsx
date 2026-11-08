import { Screen } from '@freedi/shared-types';
import { ReactNode } from 'react';
import { Translate } from './ThinkingSpace';
import styles from './MapExplorer.module.scss';

export type MapTone = 'lilac' | 'mint' | 'yellow' | 'sunken' | 'plain';

export const mapViews = [
	{
		id: Screen.mindMap,
		group: 'Understand the structure',
		title: 'Mind map',
		rowTitle: 'Mind map',
		description: 'Follow questions, solutions and their connections.',
		rowDescription: 'The question, its answers and follow-up questions as a tree, with grouping',
		tone: 'lilac' as MapTone,
		glyph:
			'M20 20h-9M20 20h9M20 20v-9M20 20v9M11 20l-4-5M11 20l-4 5M29 20l4-5M29 20l4 5M20 11l-5-3M20 11l5-3M20 29l-5 3M20 29l5 3',
	},
	{
		id: Screen.clusterBoard,
		group: 'Explore the solutions',
		title: 'Cluster map',
		rowTitle: 'Groups board',
		description:
			'Topics group related solutions. Syntheses combine equivalent wording of the same solution.',
		rowDescription: 'Similar answers grouped into topics, ready to share',
		tone: 'mint' as MapTone,
		glyph:
			'M8 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M24 10a4 4 0 1 0 8 0a4 4 0 1 0-8 0M14 28a6 6 0 1 0 12 0a6 6 0 1 0-12 0M13 15l5 8M27 13l-4 10',
	},
	{
		id: Screen.agreementMap,
		group: 'Understand agreement',
		title: 'Agreement triangle',
		rowTitle: 'Agreement Map',
		description: 'Compare support, opposition and the amount of evaluation.',
		rowDescription: 'A triangle of agreement, opposition and uncertainty for each answer',
		tone: 'yellow' as MapTone,
		glyph: 'M20 6L34 32H6L20 6zM20 6v26M6 32l14-13M34 32L20 19M17 22a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
	},
	{
		id: Screen.polarizationIndex,
		group: 'Understand agreement',
		title: 'Polarization',
		rowTitle: 'Collaboration Index',
		description: 'See where evaluations converge or differ.',
		rowDescription: 'How divided the group is, by audience',
		tone: 'sunken' as MapTone,
		glyph: 'M6 30h28M10 30v-8M16 30v-14M22 30v-10M28 30v-18M6 12c6-2 10 4 14 2s8-8 14-4',
	},
	{
		id: Screen.subQuestionsMap,
		group: 'Understand the structure',
		title: 'Sub-question map',
		rowTitle: 'Questions map',
		description: 'Follow the questions that help answer this question.',
		rowDescription: 'The tree of follow-up questions opened from here',
		tone: 'plain' as MapTone,
		glyph:
			'M14 6h12v6H14zM8 20h10v6H8zM22 20h10v6H22zM20 12v4M20 16H13v4M20 16h7v4M13 26v4M27 26v4',
	},
] as const;

export type MapView = (typeof mapViews)[number];

/** Map screens a statement offers (the questions map can be switched off by the host). */
export function availableMapViews(
	settings: { enableSubQuestionsMap?: boolean } | undefined,
): MapView[] {
	return mapViews.filter(
		(view) => view.id !== Screen.subQuestionsMap || settings?.enableSubQuestionsMap !== false,
	);
}
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
