import CovenantWorkspace from './CovenantWorkspace';
import { mapViews } from './MapExplorer';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { ArrowUpRight, FileText } from 'lucide-react';
import {
	EvaluationUI,
	ParagraphType,
	SortType,
	Statement,
	StatementType,
} from '@freedi/shared-types';
import {
	statementsSelector,
	setStatement,
	fullyLoadedScopeSelector,
} from '@/redux/statements/statementsSlice';
import { createGroupedViewSelector } from '@/redux/statements/condensationSelectors';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createStatement } from '@/controllers/db/statements/createStatement';
import { setStatementToDB } from '@/controllers/db/statements/writeStatement';
import { store } from '@/redux/store';
import RoutePicker from '@/view/components/statementRouter/RoutePicker/RoutePicker';
import SummaryDisplay from '@/view/pages/statement/components/statementTypes/question/document/MultiStageQuestion/components/SummaryDisplay/SummaryDisplay';
import { requestDiscussionSummary } from '@/controllers/db/summarization/summarizationController';
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
	const { isAutoLoading } = useAutoLoadAllForSort(statement.statementId, SortType.accepted);
	const candidates = useMemo(
		() =>
			agreementCandidates(
				[...grouped.groupedSuggestions, ...grouped.visibleOriginals],
				showResults,
			),
		[grouped, showResults],
	);
	const [synthesisControlsOpen, setSynthesisControlsOpen] = useState(false);
	const fullyLoaded = useSelector(fullyLoadedScopeSelector(statement.statementId));
	const [selected, setSelected] = useState<string[]>([]);
	const [draftTitle, setDraftTitle] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [savedDraft, setSavedDraft] = useState<Statement>();
	const [routeTarget, setRouteTarget] = useState<Statement>();
	const [summaryOverride, setSummaryOverride] = useState<{ text: string; time: number }>();
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
	const documents = all.filter(
		(p) =>
			p.parentId === statement.statementId &&
			!p.hide &&
			(p.isDocument || p.statementType === StatementType.document || p.isCovenantDraft === true),
	);
	const createDraft = async (): Promise<void> => {
		if (!isAdmin || isHalted || busy || !draftTitle.trim()) return;
		const sources = candidates.filter((p) => selected.includes(p.statementId));
		if (!sources.length) return;
		setBusy(true);
		setError('');
		try {
			const draft = createStatement({
				text: draftTitle.trim(),
				parentStatement: statement,
				statementType: StatementType.option,
				membership: statement.membership,
				paragraphs: sources.map((p, i) => ({
					paragraphId: crypto.randomUUID(),
					type: ParagraphType.paragraph,
					content: p.statement,
					order: i,
					sourceStatementId: p.statementId,
				})),
			});
			if (!draft) throw new Error(t('Could not prepare the draft.'));
			// A new proposition with fresh evaluation. No source votes or signatures are copied.
			const result = await setStatementToDB({
				statement: { ...draft, isCovenantDraft: true },
				parentStatement: statement,
			});
			if (!result) throw new Error(t('Could not save the draft. Please try again.'));
			store.dispatch(setStatement(result.statement));
			setSavedDraft(result.statement);
			setSelected([]);
		} catch (e) {
			setError(e instanceof Error ? e.message : t('Could not save the draft.'));
		} finally {
			setBusy(false);
		}
	};
	const summarize = async (): Promise<void> => {
		if (!isAdmin || busy || !showResults) return;
		setBusy(true);
		setError('');
		try {
			const result = await requestDiscussionSummary(
				statement.statementId,
				'Preserve unresolved disagreements and objections. Separate promising options from adopted decisions. Reference the source options and sub-questions. Do not infer consent from silence.',
				{ includeSubQuestions: true },
			);
			setSummaryOverride({ text: result.summary, time: result.generatedAt });
		} catch (e) {
			setError(e instanceof Error ? e.message : t('Could not generate the summary.'));
		} finally {
			setBusy(false);
		}
	};
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
						<button onClick={() => go('covenant')}>{t('Our covenant')} / אמנה</button>
						<button
							onClick={() => navigate(`/statement-screen/${statement.statementId}/clusterBoard`)}
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
									<span className={styles.journey__eyebrow}>{t('Our covenant')} / אמנה</span>
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
												navigate(`/statement-screen/${statement.statementId}/clusterBoard`)
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
										navigate(`/statement-screen/${statement.statementId}/clusterBoard`)
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
					{view === 'summary' && (
						<>
							<h2>{t('Where we stand')}</h2>
							<p>
								{t(
									'Keep shared ground and unresolved differences in view. A summary is not an adopted agreement.',
								)}
							</p>
							{showResults ? (
								<>
									<SummaryDisplay
										summary={summaryOverride?.text ?? statement.summary}
										generatedAt={summaryOverride?.time ?? statement.summaryGeneratedAt}
										statementId={statement.statementId}
										canEdit={isAdmin}
									/>
									{!statement.summary && !summaryOverride && (
										<div className={styles.journey__empty}>
											{t(
												'No summary yet. The facilitator can generate one when the discussion is ready.',
											)}
										</div>
									)}
									{isAdmin && (
										<div className={styles.journey__actions}>
											<button disabled={busy} onClick={summarize}>
												{busy ? t('Working…') : t('Generate updated summary')}
											</button>
										</div>
									)}
								</>
							) : (
								<p>
									{t(
										'Results are hidden. The summary is unavailable during independent evaluation.',
									)}
								</p>
							)}
							<div className={styles.journey__actions}>
								<button onClick={() => go('questions')}>{t('Explore unresolved questions')}</button>
								<button onClick={() => go('covenant')}>{t('Read the exact wording')}</button>
							</div>
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
					{view === 'covenant' && (
						<>
							<CovenantWorkspace
								key={statement.statementId}
								statement={statement}
								solutions={candidates}
							/>
							<details className={styles.journey__section}>
								<summary>{t('Other document drafts and Sign tools')}</summary>
								<h2>{t('Our covenant')} / אמנה</h2>
								<p>
									{t(
										'Draft together first. Review the consolidated wording before asking people to sign.',
									)}
								</p>
								{[
									...documents,
									...(savedDraft && !documents.some((d) => d.statementId === savedDraft.statementId)
										? [savedDraft]
										: []),
								].map((doc) => (
									<article
										className={styles.journey__card}
										data-tone="yellow"
										key={doc.statementId}
									>
										<span className={styles.journey__eyebrow}>
											{doc.isDocument ? t('Document workspace') : t('New draft · not approved')}
										</span>
										<h3>{doc.statement}</h3>
										<div className={styles.journey__actions}>
											<button onClick={() => open(doc.statementId)}>
												{t('Read & discuss the wording')}
											</button>
											{isAdmin && (
												<button onClick={() => setRouteTarget(doc)}>
													{t('Continue in document tools')}
												</button>
											)}
										</div>
									</article>
								))}
								{isAdmin ? (
									<section className={`${styles.journey__document} ${styles.journey__section}`}>
										<h3>{t('Assemble a new draft from options')}</h3>
										<p>
											{t(
												'Select the wording to bring together. This creates a new draft with source links and no inherited evaluations or signatures.',
											)}
										</p>
										<label htmlFor="covenant-title">{t('Draft title')}</label>
										<input
											id="covenant-title"
											value={draftTitle}
											onChange={(e) => setDraftTitle(e.target.value)}
											placeholder={t('Our shared covenant')}
										/>
										<div className={styles.journey__section}>
											{candidates.map((p) => (
												<label key={p.statementId}>
													<input
														type="checkbox"
														checked={selected.includes(p.statementId)}
														onChange={(e) =>
															setSelected(
																e.target.checked
																	? [...selected, p.statementId]
																	: selected.filter((id) => id !== p.statementId),
															)
														}
													/>{' '}
													{p.statement}
												</label>
											))}
										</div>
										<div className={styles.journey__actions}>
											<button
												className={styles.journey__primary}
												disabled={isHalted || busy || !draftTitle.trim() || !selected.length}
												onClick={createDraft}
											>
												{busy ? t('Saving…') : t('Create shared draft')}
											</button>
										</div>
										<p className={styles.journey__muted}>
											{t(
												'Continue with the existing document tools for paragraph comments, amendments, versions, and signing. Creating a draft does not open a signing round.',
											)}
										</p>
									</section>
								) : (
									<div className={styles.journey__empty}>
										{t(
											'The facilitator assembles the shared draft. You can help by evaluating options and discussing improvements.',
										)}
										<div className={styles.journey__actions}>
											<button onClick={() => go('options')}>{t('Explore & improve')}</button>
										</div>
									</div>
								)}
							</details>
						</>
					)}
				</>
			)}
			{error && <p role="alert">{error}</p>}
			{routeTarget && (
				<RoutePicker statement={routeTarget} isOpen onClose={() => setRouteTarget(undefined)} />
			)}
		</div>
	);
}
