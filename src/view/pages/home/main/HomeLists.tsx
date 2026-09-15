import React from 'react';
import { Users } from 'lucide-react';
import {
	formatQuestionMeta,
	formatSpaceMeta,
	HomeQuestion,
	HomeSpace,
	Translate,
} from '../homeModel';
import styles from './HomeOverview.module.scss';

export function SpaceCard({
	space,
	onOpen,
	t,
}: {
	space: HomeSpace;
	onOpen: (space: HomeSpace) => void;
	t: Translate;
}) {
	return (
		<button
			type="button"
			className={styles.spaceCard}
			data-tone={space.tone}
			onClick={() => onOpen(space)}
			data-testid="home-space-card"
		>
			<span className={styles.spaceCard__glyph} aria-hidden="true">
				<Users size={20} />
			</span>
			<span className={styles.spaceCard__body}>
				<span className={styles.spaceCard__name}>{space.title}</span>
				<span className={styles.spaceCard__meta}>
					{formatSpaceMeta(space.questionCount, space.openCount, t)}
				</span>
			</span>
			{space.hosting && <span className={styles.hostChip}>{t('Host')}</span>}
		</button>
	);
}

export function QuestionRow({
	question,
	onOpen,
	now,
	locale,
	t,
}: {
	question: HomeQuestion;
	onOpen: (id: string) => void;
	now: number;
	locale: string;
	t: Translate;
}) {
	const meta = formatQuestionMeta(question, now, locale, t);

	return (
		<li>
			<button
				type="button"
				className={styles.questionRow}
				onClick={() => onOpen(question.id)}
				data-testid="home-question-row"
			>
				<span className={styles.questionRow__spine} data-tone={question.tone} aria-hidden="true" />
				<span className={styles.questionRow__body}>
					<span className={styles.questionRow__title}>{question.title}</span>
					{meta && <span className={styles.questionRow__meta}>{meta}</span>}
				</span>
				{question.hosting && (
					<span className={`${styles.hostChip} ${styles['hostChip--lilac']}`}>{t('Host')}</span>
				)}
			</button>
		</li>
	);
}
