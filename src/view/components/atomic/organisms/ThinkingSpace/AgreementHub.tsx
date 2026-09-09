import QuestionProcess from './QuestionProcess';
import { mapViews } from './MapExplorer';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { ArrowUpRight, FileText } from 'lucide-react';
import { EvaluationUI, Screen, SortType, Statement, StatementType } from '@freedi/shared-types';
import { statementsSelector, fullyLoadedScopeSelector } from '@/redux/statements/statementsSlice';
import { createGroupedViewSelector } from '@/redux/statements/condensationSelectors';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SynthesisPanel from '@/view/pages/statement/components/settings/components/synthesisPanel/SynthesisPanel';
import { agreementCandidates, proposalEvidence } from './agreementData';
import styles from './Agreement.module.scss';
import { useAutoLoadAllForSort } from '@/view/pages/statement/hooks/useAutoLoadAllForSort';

export const AGREEMENT_VIEWS = ['overview', 'themes', 'covenant', 'summary', 'maps'];
const selectGrouped = createGroupedViewSelector(statementsSelector);
const percent = (n?: number): string => (n === undefined ? '—' : `${Math.round(n * 100)}%`);

export default function AgreementHub({
	statement,
	view = 'overview',
	compact = false,
}: {
	statement: Statement;
	view?: string;
	compact?: boolean;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const authorization = useAuthorization(statement.statementId);
	const isAdmin =
		authorization.isAdmin ||
		(!!authorization.creator?.uid &&
			(statement.creatorId === authorization.creator.uid ||
				statement.creator?.uid === authorization.creator.uid));
	const { isHalted } = useIsProcessHalted(statement);
	const canAddSolution =
		isAdmin ||
		(authorization.isAuthorized &&
			(statement.evaluationSettings?.evaluationUI === EvaluationUI.voting
				? statement.statementSettings?.enableAddVotingOption === true
				: statement.statementSettings?.enableAddEvaluationOption === true));
	const all = useSelector(statementsSelector);
	const groupedSelector = useMemo(
		() => selectGrouped(statement.statementId, 'main'),
		[statement.statementId],
	);
	const grouped = useSelector(groupedSelector);
	const showResults = statement.statementSettings?.showEvaluation === true;
	const { isAutoLoading } = useAutoLoadAllForSort(
		compact || !['overview', 'themes'].includes(view) ? undefined : statement.statementId,
		SortType.accepted,
	);
	const candidates = useMemo(
		() =>
			agreementCandidates(
				[...grouped.groupedSuggestions, ...grouped.visibleOriginals],
				showResults,
			),
		[grouped, showResults],
	);
	const [synthesisControlsOpen, setSynthesisControlsOpen] = useState(false);
	const loadedSelector = useMemo(
		() => fullyLoadedScopeSelector(statement.statementId),
		[statement.statementId],
	);
	const fullyLoaded = useSelector(loadedSelector);
	const go = (tab: string): void => {
		navigate(`/statement/${statement.statementId}?tab=${tab}`);
	};
	const open = (id: string): void => {
		navigate(`/statement/${id}?tab=chat`);
	};
	const subQuestions = all.filter(
		(p) =>
			p.parentId === statement.statementId && p.statementType === StatementType.question && !p.hide,
	);
	const parent = all.find((p) => p.statementId === statement.parentId);
	const evidence = (p: Statement): React.ReactNode => {
		if (!showResults)
			return (
				<p className={styles.journey__muted}>{t('Results are hidden. Evaluate independently.')}</p>
			);
		const e = proposalEvidence(p);

		return (
			<>
				<div className={styles.journey__stats}>
					<span>
						<strong>{percent(e.score)}</strong>
						{t('Consensus score')}
					</span>
					<span>
						<strong>{e.n}</strong>
						{t('People evaluated')}
					</span>
				</div>
				<div className={styles.journey__evidence}>
					<span>
						{t('Average sentiment')}: {percent(e.mean)}
					</span>
					<span>
						{t('Oppose')}: {e.oppose ?? t('Not available')}
					</span>
					{e.confidence !== undefined && (
						<span>
							{t('Confidence')}: {percent(e.confidence)}
						</span>
					)}
					{e.n < 3 && <span>{t('Needs more evaluation')}</span>}
				</div>
			</>
		);
	};
	const card = (p: Statement): React.ReactNode => (
		<article key={p.statementId} className={styles.journey__card} data-tone="mint">
			<h3>{p.statement}</h3>
			{evidence(p)}
			<div className={styles.journey__actions}>
				<button onClick={() => open(p.statementId)}>
					{t('Explore & improve')} <ArrowUpRight size={16} />
				</button>
			</div>
		</article>
	);

	if (!compact && (view === 'summary' || view === 'covenant'))
		return (
			<div className={styles.journey}>
				<QuestionProcess statement={statement} view={view} />
			</div>
		);

	return (
		<div className={`${styles.journey} ${compact ? styles.journey__aside : ''}`}>
			{compact ? (
				<>
					<span className={styles.journey__eyebrow}>{t('Toward our agreement')}</span>
					<h2>{t('Common ground')}</h2>
					<p className={styles.journey__muted}>
						{showResults
							? fullyLoaded
								? t('Candidates ranked by confidence-adjusted consensus.')
								: t('Loaded options only; the complete ranking is not available yet.')
							: t('Results are hidden. Evaluate independently.')}
					</p>
					{candidates.slice(0, 2).map(card)}
					<div className={styles.journey__actions}>
						<button onClick={() => go('overview')}>{t('Open agreement overview')}</button>
						<button onClick={() => go('covenant')}>{t('Our covenant')}</button>
						<button
							onClick={() =>
								navigate(`/statement-screen/${statement.statementId}/${Screen.clusterBoard}`)
							}
						>
							{t('Themes & synthesis')}
						</button>
						<button onClick={() => go('summary')}>{t('Summary')}</button>
						<button onClick={() => go('maps')}>{t('Maps')}</button>
					</div>
				</>
			) : (
				<>
					{view === 'overview' && (
						<>
							{statement.parentId && statement.parentId !== 'top' && (
								<nav aria-label={t('Question path')}>
									<button onClick={() => navigate(`/statement/${statement.parentId}?tab=overview`)}>
										← {parent?.statement || t('Parent question')}
									</button>
								</nav>
							)}

							<div className={styles.journey__hero}>
								<div>
									<span className={styles.journey__eyebrow}>{t('Question')}</span>
									<h2>{statement.statement}</h2>
									<p>
										{t(
											'Explore solutions and sub-questions. Each sub-question has its own solutions and can branch further.',
										)}
									</p>
									<div className={styles.journey__actions}>
										<button
											className={styles.journey__primary}
											disabled={!canAddSolution || isHalted}
											onClick={() =>
												navigate(`/statement/${statement.statementId}?tab=options&compose=solution`)
											}
										>
											+ {t('solutionsOnboarding.addSolution')}
										</button>
										<button onClick={() => go('options')}>{t('Explore & improve')} ↗</button>
									</div>
								</div>
								<span className={styles.journey__flower} aria-hidden="true">
									✳
								</span>
							</div>
							<QuestionProcess statement={statement} view="overview" />
							<section className={styles.journey__section} aria-label={t('Sub-questions')}>
								<div className={styles.journey__title}>
									<h3>
										{t('Sub-questions')} · {subQuestions.length}
									</h3>
									<button onClick={() => go('questions')}>
										{t('Explore unresolved questions')} ↗
									</button>
								</div>
								<p>
									{t(
										'Explore solutions and sub-questions. Each sub-question has its own solutions and can branch further.',
									)}
								</p>
								<div className={styles.journey__grid}>
									{subQuestions.map((q) => (
										<article key={q.statementId} className={styles.journey__card} data-tone="peach">
											<span className={styles.journey__eyebrow}>{t('Question')}</span>
											<h3>{q.statement}</h3>
											<button onClick={() => navigate(`/statement/${q.statementId}?tab=overview`)}>
												{t('Explore question')} ↗
											</button>
										</article>
									))}
								</div>
								{!subQuestions.length && (
									<p>
										{t('No sub-questions loaded. Open the question list to explore or add one.')}
									</p>
								)}
							</section>
							<div className={styles.journey__grid}>
								<section className={styles.journey__card} data-tone="yellow">
									<span className={styles.journey__eyebrow}>{t('Our covenant')}</span>
									<h3>{t('From options to shared wording')}</h3>
									<p>
										{t('Assemble a draft, work on its clauses, then continue to document review.')}
									</p>
									<div className={styles.journey__actions}>
										<button onClick={() => go('covenant')}>
											{t('Open our covenant')} <FileText size={16} />
										</button>
									</div>
								</section>
								<section className={styles.journey__card} data-tone="peach">
									<span className={styles.journey__eyebrow}>{t('Understand the differences')}</span>
									<h3>{t('Make room for every perspective')}</h3>
									<p>
										{t(
											'Explore related ideas, inspect syntheses, and follow the questions that need more work.',
										)}
									</p>
									<div className={styles.journey__actions}>
										<button
											onClick={() =>
												navigate(
													`/statement-screen/${statement.statementId}/${Screen.clusterBoard}`,
												)
											}
										>
											{t('Themes & synthesis')}
										</button>
										<button onClick={() => go('maps')}>{t('Maps')}</button>
									</div>
								</section>
							</div>
							<section className={styles.journey__section}>
								<h3>
									{showResults
										? fullyLoaded
											? t('Strongest common ground so far')
											: t('Leading options among those loaded')
										: t('Options to explore')}
								</h3>
								<p className={styles.journey__muted}>
									{t('These are candidate options, not adopted decisions.')}
								</p>
								{isAutoLoading && <p role="status">{t('Loading the complete set of options…')}</p>}
								<div className={styles.journey__grid}>{candidates.slice(0, 4).map(card)}</div>
								{!candidates.length && (
									<div className={styles.journey__empty}>
										{t('No options yet. Begin with a proposal or a question.')}
										<div className={styles.journey__actions}>
											<button onClick={() => go('options')}>{t('Explore options')}</button>
										</div>
									</div>
								)}
							</section>
						</>
					)}
					{view === 'themes' && (
						<>
							<nav className={styles.journey__actions}>
								<button onClick={() => go('maps')}>{t('Maps')}</button>
								<span>› {t('Themes & synthesis')}</span>
								<button
									onClick={() =>
										navigate(`/statement-screen/${statement.statementId}/${Screen.clusterBoard}`)
									}
								>
									{t('Open map')} ↗
								</button>
							</nav>
							<h2>{t('Themes & synthesis')}</h2>
							<p>
								{t(
									'Themes organize related positions. Synthesis combines equivalent proposals. New compromises need fresh evaluation.',
								)}
							</p>
							{grouped.groupedSuggestions.map((group) => (
								<section className={styles.journey__card} data-tone="lilac" key={group.statementId}>
									<span className={styles.journey__eyebrow}>
										{group.derivedByPipeline === 'synthesis'
											? t('Equivalent proposals synthesized')
											: t('Theme · distinct positions')}
									</span>
									<h3>{group.statement}</h3>
									{grouped.allowDrillToOriginals && (
										<details>
											<summary>
												{t('Inspect original proposals')} ({group.integratedOptions?.length ?? 0})
											</summary>
											{(group.integratedOptions ?? []).map((id) => {
												const p = all.find((x) => x.statementId === id && !x.hide);

												return p ? (
													<div className={styles.journey__actions} key={id}>
														<button onClick={() => open(id)}>{p.statement} ↗</button>
													</div>
												) : null;
											})}
										</details>
									)}
									<div className={styles.journey__actions}>
										<button onClick={() => open(group.statementId)}>{t('Open this group')}</button>
									</div>
								</section>
							))}
							{!grouped.groupedSuggestions.length && (
								<div className={styles.journey__empty}>
									{t('No themes or syntheses have been created yet.')}
								</div>
							)}
							<div className={styles.journey__actions}>
								<button onClick={() => go('options')}>{t('Explore all options')}</button>
							</div>
							{isAdmin && (
								<details className={styles.journey__section}>
									<summary onClick={() => setSynthesisControlsOpen((value) => !value)}>
										{t('Facilitator synthesis controls')}
									</summary>
									{synthesisControlsOpen && <SynthesisPanel statement={statement} />}
								</details>
							)}
						</>
					)}
					{view === 'maps' && (
						<>
							<h2>{t('Maps')}</h2>
							<p>{statement.statement}</p>
							{[...new Set(mapViews.map((map) => map.group))].map((group) => (
								<section key={group} className={styles.journey__section}>
									<h3>{t(group)}</h3>
									<div className={styles.journey__grid}>
										{mapViews
											.filter((map) => map.group === group)
											.map((map) => (
												<article
													key={map.id}
													className={styles.journey__card}
													data-tone={group === 'Understand agreement' ? 'mint' : 'peach'}
												>
													<h3>{t(map.title)}</h3>
													<p>{t(map.description)}</p>
													<button
														onClick={() =>
															navigate(`/statement-screen/${statement.statementId}/${map.id}`)
														}
													>
														{t('Open map')} ↗
													</button>
												</article>
											))}
									</div>
								</section>
							))}
						</>
					)}
				</>
			)}
		</div>
	);
}
