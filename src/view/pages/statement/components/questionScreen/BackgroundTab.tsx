import { FC, useRef } from 'react';
import clsx from 'clsx';
import { useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { formatTimeRemaining } from '@/helpers/deadlineHelpers';
import StatementBody from '@/view/components/atomic/molecules/StatementBody/StatementBody';
import StatementDescription from '@/view/components/atomic/molecules/StatementDescription/StatementDescription';
import { STAGE_LABEL_KEYS } from './questionStage';
import type { QuestionScreenData } from './useQuestionScreenData';
import styles from './QuestionScreen.module.scss';

/** One line under each stage in "How it works" — the prototype's HOW copy. */
const HOW_KEYS: readonly string[] = [
	'Everyone proposes an answer. Duplicates are checked quietly.',
	'Rate each answer on its own — what you could live with.',
	'If needed, vote between the leading answers.',
	'The result becomes a written agreement.',
];

interface BackgroundTabProps {
	statement: Statement;
	data: QuestionScreenData;
}

/**
 * רקע — the host's framing (brief + rich body), how the four stages work with
 * the current one highlighted, participants and closing, and for hosts a way
 * into editing the background.
 */
const BackgroundTab: FC<BackgroundTabProps> = ({ statement, data }) => {
	const { t } = useTranslation();
	const bodyRef = useRef<HTMLDivElement>(null);
	const space = useSelector(statementSelectorById(statement.topParentId));
	const hostName = statement.creator?.displayName;
	const deadline = statement.questionSettings?.deadline;
	const members = statement.numberOfMembers;

	function handleEdit() {
		const container = bodyRef.current;
		const editButton = container?.querySelector<HTMLButtonElement>('.statement-body__edit-button');
		if (editButton) editButton.click();
		container?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
	}

	const closing =
		typeof deadline === 'number' && deadline > 0
			? data.isDeadlinePassed
				? t('Closed')
				: t('Closes in {time}').replace('{time}', formatTimeRemaining(deadline - Date.now()))
			: undefined;

	return (
		<div className={styles.tab} data-testid="background-tab">
			<article className={styles.card}>
				<span className={styles.eyebrow}>{t('Background from the host')}</span>
				{statement.brief && (
					<StatementDescription brief={statement.brief} className={styles.background__brief} />
				)}
				<div ref={bodyRef} className={styles.background__body}>
					<StatementBody host={statement} canEdit={data.isHost} />
				</div>
				{hostName && (
					<div className={styles.byline}>
						<span className={styles.byline__avatar} aria-hidden="true">
							{hostName.charAt(0).toUpperCase()}
						</span>
						<span className={styles.byline__text}>
							<span className={styles.byline__name}>
								{hostName}, {t('host')}
							</span>
							{space && space.statementId !== statement.statementId && (
								<span className={styles.byline__space}>{space.statement}</span>
							)}
						</span>
					</div>
				)}
			</article>

			<section className={styles.how} aria-labelledby="how-it-works-title">
				<h2 id="how-it-works-title" className={styles.how__title}>
					{t('How it works')}
				</h2>
				<ol className={styles.how__list}>
					{STAGE_LABEL_KEYS.map((key, index) => {
						const state = index < data.stage ? 'done' : index === data.stage ? 'active' : 'future';

						return (
							<li
								key={key}
								className={styles.how__item}
								aria-current={state === 'active' ? 'step' : undefined}
							>
								<span className={clsx(styles.how__number, styles[`how__number--${state}`])}>
									{index + 1}
								</span>
								<span className={styles.how__text}>
									<span
										className={clsx(
											styles.how__label,
											state === 'active' && styles['how__label--active'],
										)}
									>
										{t(key)}
									</span>
									<span className={styles.how__sub}>{t(HOW_KEYS[index])}</span>
								</span>
							</li>
						);
					})}
				</ol>
			</section>

			{(typeof members === 'number' || closing) && (
				<p className={styles.meta}>
					{typeof members === 'number' && (
						<span>{t('{n} participants').replace('{n}', String(members))}</span>
					)}
					{typeof members === 'number' && closing && <span aria-hidden="true">·</span>}
					{closing && <span>{closing}</span>}
				</p>
			)}

			{data.isHost && (
				<button
					type="button"
					className={styles.outlineButton}
					onClick={handleEdit}
					data-testid="background-edit"
				>
					{t('Edit the background')}
				</button>
			)}
		</div>
	);
};

export default BackgroundTab;
