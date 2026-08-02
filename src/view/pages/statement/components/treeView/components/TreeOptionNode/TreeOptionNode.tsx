import React, { FC, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { Layers, Sparkles, Tags, ChevronDown, ChevronRight, RefreshCw, Undo2 } from 'lucide-react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	statementSubscriptionSelector,
	statementsSelector,
} from '@/redux/statements/statementsSlice';
import { isAuthorized } from '@/controllers/general/helpers';
import { handleAddStatement } from '@/view/pages/statement/components/chat/components/input/StatementInputCont';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import StatementTypeIcon from '../StatementTypeIcon/StatementTypeIcon';
import EditableStatement from '@/view/components/edit/EditableStatement';
import ChatMessageMenu from '@/view/pages/statement/components/chat/components/chatMessageCard/ChatMessageMenu';
import Evaluation from '@/view/pages/statement/components/evaluations/components/evaluation/Evaluation';
import { useBookmark } from '@/controllers/hooks/useBookmark';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import {
	regenerateSynthesisProposal,
	reverseIntegration,
} from '@/controllers/db/integration/integrationController';
import SendIcon from '@/view/components/icons/SendIcon';
import JoinButtons from '@/view/pages/statement/components/joining/JoinButtons';
import RichHtmlContent from '@/view/components/richHtml/RichHtmlContent';
import styles from './TreeOptionNode.module.scss';

// Stable empty array reference shared across all non-synthesis nodes, so the
// useMemo bail-out doesn't return a new [] each render and trigger the
// "selector returned a different result" warning + render storm.
const EMPTY_STATEMENTS: Statement[] = [];

interface TreeOptionNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
	onReplySubmitted?: () => void;
	onReply?: (statement: Statement) => void;
	childCount?: number;
	onToggleChildren?: () => void;
	isNew?: boolean;
}

const TreeOptionNode: FC<TreeOptionNodeProps> = ({
	statement,
	parentStatement,
	onReplySubmitted,
	onReply,
	childCount = 0,
	onToggleChildren,
	isNew,
}) => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const statementSubscription = useAppSelector(statementSubscriptionSelector(statement.parentId));

	const _isAuthorized = isAuthorized(
		statement,
		statementSubscription,
		parentStatement?.creator?.uid,
	);

	const { isBookmarked, toggle: toggleBookmarkFn } = useBookmark(statement.statementId);
	// Authorize against the parent so admin actions on the imported question
	// (regenerate / reverse synthesis) authorize via the parent subscription.
	const { isAdmin: isParentAdmin } = useAuthorization(statement.parentId);

	const [isEdit, setIsEdit] = useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [showReplyInput, setShowReplyInput] = useState(false);
	const [replyText, setReplyText] = useState('');
	// Synthesis-only: collapse the source list under a "Built from N ideas"
	// toggle so the proposal text is the dominant element of the node.
	const [sourcesOpen, setSourcesOpen] = useState(false);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const [isReversing, setIsReversing] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const replyInputRef = useRef<HTMLTextAreaElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (showReplyInput && replyInputRef.current) {
			replyInputRef.current.focus();
		}
	}, [showReplyInput]);

	const adjustTextareaHeight = () => {
		if (replyInputRef.current) {
			replyInputRef.current.style.height = 'auto';
			replyInputRef.current.style.height = `${replyInputRef.current.scrollHeight}px`;
		}
	};

	const handleReplyToggle = () => {
		setShowReplyInput((prev) => !prev);
		setReplyText('');
	};

	const handleReplySubmit = (
		e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		e.preventDefault();
		if (!replyText.trim()) return;

		try {
			handleAddStatement(replyText, statement);
			setReplyText('');
			setShowReplyInput(false);
			onReplySubmitted?.();
		} catch (error) {
			logError(error, {
				operation: 'TreeOptionNode.handleReplySubmit',
				statementId: statement.statementId,
			});
		}
	};

	const handleReplyKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			setShowReplyInput(false);
			setReplyText('');

			return;
		}

		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			navigator.userAgent,
		);

		if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
			handleReplySubmit(e);
		}
	};

	const handleSaveSuccess = useCallback(() => {
		setIsEdit(false);
	}, []);

	const handleRegenerateProposal = useCallback(async () => {
		const integratedCount = statement.integratedOptions?.length ?? 0;
		const confirmCopy = t(
			'Regenerate this synthesized proposal? The AI will redraft the title, description, and sections from the {count} source ideas. Existing evaluations on the proposal stay intact.',
		).replace('{count}', String(integratedCount));
		if (!window.confirm(confirmCopy)) return;
		setIsRegenerating(true);
		try {
			const result = await regenerateSynthesisProposal({
				clusterStatementId: statement.statementId,
			});
			if (result.cannotSynthesize) {
				const reason = result.splitReason || t('The source ideas span incompatible directions.');
				window.alert(
					t(
						'The AI declined to synthesize this group: {reason} Consider reversing this synthesis and re-running the pipeline so the group can be split.',
					).replace('{reason}', reason),
				);
			}
		} catch (error) {
			logError(error, {
				operation: 'TreeOptionNode.handleRegenerateProposal',
				statementId: statement.statementId,
			});
			window.alert(t('Regenerating proposal failed. Please try again.'));
		} finally {
			setIsRegenerating(false);
		}
	}, [statement.statementId, statement.integratedOptions, t]);

	const handleReverseSynthesis = useCallback(async () => {
		const integratedCount = statement.integratedOptions?.length ?? 0;
		const confirmCopy = t(
			'Reverse this synthesis? The {count} source ideas will be restored as separate proposals and the synthesized proposal will be hidden. Direct evaluations on the synthesis will be deleted; evaluations on each source idea remain intact.',
		).replace('{count}', String(integratedCount));
		if (!window.confirm(confirmCopy)) return;
		setIsReversing(true);
		try {
			await reverseIntegration({ clusterStatementId: statement.statementId });
		} catch (error) {
			logError(error, {
				operation: 'TreeOptionNode.handleReverseSynthesis',
				statementId: statement.statementId,
			});
			window.alert(t('Reversing synthesis failed. Please try again.'));
		} finally {
			setIsReversing(false);
		}
	}, [statement.statementId, statement.integratedOptions, t]);

	const handleToggleAndScroll = useCallback(() => {
		onToggleChildren?.();
		setTimeout(() => {
			if (cardRef.current) {
				cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
				cardRef.current.classList.add(styles['tree-option-node--highlight']);
				setTimeout(() => {
					cardRef.current?.classList.remove(styles['tree-option-node--highlight']);
				}, 3000);
			}
		}, 150);
	}, [onToggleChildren]);

	const isInResults =
		parentStatement?.results?.some((result) => result.statementId === statement.statementId) ??
		false;

	const isFailed = statement.joinStatus === 'failed';
	const isCluster = statement.isCluster === true;
	const integratedOptions = statement.integratedOptions ?? [];
	const integratedCount = integratedOptions.length;
	const pipeline = statement.derivedByPipeline;
	const isSynthesis = pipeline === 'synthesis';
	const isTopicCluster = pipeline === 'topic-cluster';

	// Source statements for synthesis: read what's already in Redux. Tree
	// loads the parent's options, so source originals are present in the
	// common case; missing ones are quietly omitted with a "loading…" tail.
	//
	// IMPORTANT: this selector must NOT return a fresh array reference on
	// every render — with 100+ tree nodes mounted, that triggers a render
	// storm that saturates Firestore listeners. Subscribe to the full
	// statements array via the stable selector, then derive the per-node
	// sources via useMemo so re-renders happen only when statements change.
	const allStatements = useAppSelector(statementsSelector);
	const synthesisSources = useMemo(() => {
		if (!isSynthesis || integratedOptions.length === 0) return EMPTY_STATEMENTS;
		const byId = new Map(allStatements.map((s) => [s.statementId, s]));
		const out: Statement[] = [];
		for (const id of integratedOptions) {
			const found = byId.get(id);
			if (found) out.push(found);
		}

		return out;
	}, [isSynthesis, integratedOptions, allStatements]);
	const synthesisSourcesMissing = isSynthesis
		? Math.max(0, integratedCount - synthesisSources.length)
		: 0;
	const nodeClassName = [
		styles['tree-option-node'],
		isInResults ? styles['tree-option-node--selected'] : '',
		isNew ? styles['tree-option-node--new'] : '',
		isFailed ? styles['tree-option-node--failed'] : '',
		isCluster ? styles['tree-option-node--cluster'] : '',
		isSynthesis ? styles['tree-option-node--synthesis'] : '',
	]
		.filter(Boolean)
		.join(' ');

	// Cluster badge: synthesis gets a Sparkles icon and "Synthesized · N"
	// label so users can tell paraphrase-merged proposals apart from
	// auto-grouped ones at a glance.
	let clusterBadgeIcon: React.ReactNode;
	let clusterBadgeText: string;
	let clusterBadgeAria: string;
	if (isSynthesis) {
		clusterBadgeIcon = <Sparkles size={12} aria-hidden />;
		clusterBadgeText = t('Synthesized · {count}').replace('{count}', String(integratedCount));
		clusterBadgeAria = t('Synthesized proposal merging {count} similar suggestions').replace(
			'{count}',
			String(integratedCount),
		);
	} else if (isTopicCluster) {
		clusterBadgeIcon = <Tags size={12} aria-hidden />;
		clusterBadgeText = t('Topic · {count}').replace('{count}', String(integratedCount));
		clusterBadgeAria = t('Topic cluster representing {count} suggestions').replace(
			'{count}',
			String(integratedCount),
		);
	} else {
		clusterBadgeIcon = <Layers size={12} aria-hidden />;
		clusterBadgeText = t('Group · {count}').replace('{count}', String(integratedCount));
		clusterBadgeAria = t('Grouped suggestion representing {count} originals').replace(
			'{count}',
			String(integratedCount),
		);
	}

	return (
		<div ref={cardRef} className={nodeClassName}>
			<div className={styles['tree-option-node__avatar']}>
				<StatementTypeIcon type={statement.statementType} isSelected={isInResults} />
			</div>
			<div className={styles['tree-option-node__body']}>
				<div className={styles['tree-option-node__header']}>
					{isCluster && (
						<span
							className={[
								styles['tree-option-node__cluster-badge'],
								isSynthesis ? styles['tree-option-node__cluster-badge--synthesis'] : '',
								isTopicCluster ? styles['tree-option-node__cluster-badge--topic'] : '',
							]
								.filter(Boolean)
								.join(' ')}
							aria-label={clusterBadgeAria}
							title={clusterBadgeAria}
						>
							{clusterBadgeIcon}
							<span>{clusterBadgeText}</span>
						</span>
					)}
					<div className={styles['tree-option-node__menu']}>
						<ChatMessageMenu
							statement={statement}
							parentStatement={parentStatement}
							isCardMenuOpen={isCardMenuOpen}
							setIsCardMenuOpen={setIsCardMenuOpen}
							isAuthorized={_isAuthorized}
							setIsEdit={setIsEdit}
							fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
						/>
					</div>
				</div>
				{isEdit ? (
					<EditableStatement
						statement={statement}
						showDescription={true}
						multiline={true}
						forceEditable={true}
						forceEditing={true}
						onSaveSuccess={handleSaveSuccess}
					/>
				) : (
					<>
						<div className={styles['tree-option-node__text']}>
							<RichHtmlContent content={statement.statement} />
						</div>
						{statement.paragraphs && statement.paragraphs.length > 0 ? (
							<div className={styles['tree-option-node__paragraphs']}>
								{[...statement.paragraphs]
									.sort((a, b) => a.order - b.order)
									.map((p) => (
										<p key={p.paragraphId}>
											<RichHtmlContent content={p.content} />
										</p>
									))}
							</div>
						) : statement.description ? (
							<div className={styles['tree-option-node__description']}>
								<RichHtmlContent content={statement.description} />
							</div>
						) : null}
						{isSynthesis && (
							<>
								<div className={styles['tree-option-node__proposal-actions']}>
									{synthesisSources.length > 0 && (
										<button
											type="button"
											className={styles['tree-option-node__sources-toggle']}
											aria-expanded={sourcesOpen}
											onClick={() => setSourcesOpen((v) => !v)}
										>
											{sourcesOpen ? (
												<ChevronDown size={12} aria-hidden />
											) : (
												<ChevronRight size={12} aria-hidden />
											)}
											<span>
												{t('Built from {count} source ideas').replace(
													'{count}',
													String(integratedCount),
												)}
											</span>
										</button>
									)}
									{isParentAdmin && (
										<>
											<button
												type="button"
												className={styles['tree-option-node__proposal-admin-btn']}
												onClick={handleRegenerateProposal}
												disabled={isRegenerating}
												title={t('Regenerate proposal (admin)')}
												aria-label={t('Regenerate proposal (admin)')}
											>
												<RefreshCw size={11} aria-hidden />
												<span>
													{isRegenerating ? t('Regenerating…') : t('Regenerate proposal')}
												</span>
											</button>
											<button
												type="button"
												className={`${styles['tree-option-node__proposal-admin-btn']} ${styles['tree-option-node__proposal-admin-btn--danger']}`}
												onClick={handleReverseSynthesis}
												disabled={isReversing}
												title={t('Reverse synthesis (admin)')}
												aria-label={t('Reverse synthesis (admin)')}
											>
												<Undo2 size={11} aria-hidden />
												<span>{isReversing ? t('Reversing…') : t('Reverse synthesis')}</span>
											</button>
										</>
									)}
								</div>
								{sourcesOpen && synthesisSources.length > 0 && (
									<div
										className={styles['tree-option-node__sources']}
										aria-label={t('Source ideas synthesized into this proposal')}
									>
										<div className={styles['tree-option-node__sources-header']}>
											<Sparkles size={11} aria-hidden />
											<span>
												{t('Synthesized from {count} source ideas:').replace(
													'{count}',
													String(integratedCount),
												)}
											</span>
										</div>
										<ul className={styles['tree-option-node__sources-list']}>
											{synthesisSources.map((src) => (
												<li
													key={src.statementId}
													className={styles['tree-option-node__sources-item']}
												>
													<button
														type="button"
														className={styles['tree-option-node__sources-link']}
														onClick={() => navigate(`/statement/${src.statementId}`)}
														title={src.statement}
													>
														<span>›</span>
														<span className={styles['tree-option-node__sources-title']}>
															{src.statement}
														</span>
													</button>
												</li>
											))}
										</ul>
										{synthesisSourcesMissing > 0 && (
											<span className={styles['tree-option-node__sources-more']}>
												{t('…and {count} more (loading)').replace(
													'{count}',
													String(synthesisSourcesMissing),
												)}
											</span>
										)}
									</div>
								)}
							</>
						)}
					</>
				)}
				<div className={styles['tree-option-node__evaluation']}>
					<Evaluation statement={statement} />
				</div>
				<div className={styles['tree-option-node__actions']}>
					<button
						className={styles['tree-option-node__action-btn']}
						onClick={onReply ? () => onReply(statement) : handleReplyToggle}
						aria-label={t('reply')}
					>
						{t('reply')}
					</button>
					<button
						className={styles['tree-option-node__action-btn']}
						onClick={() => navigate(`/statement/${statement.statementId}`)}
						aria-label={t('Dive in')}
					>
						{t('Dive in')}
					</button>
					<button
						className={`${styles['tree-option-node__action-btn']} ${styles['tree-option-node__bookmark-btn']} ${isBookmarked ? styles['tree-option-node__bookmark-btn--active'] : ''}`}
						onClick={toggleBookmarkFn}
						aria-label={isBookmarked ? t('Remove bookmark') : t('Bookmark')}
					>
						<span
							className="material-symbols-outlined"
							style={{
								fontSize: 18,
								fontVariationSettings: isBookmarked ? "'FILL' 1" : "'FILL' 0",
							}}
						>
							bookmark
						</span>
					</button>
					{childCount > 0 && onToggleChildren && (
						<button
							className={styles['tree-option-node__reply-counter']}
							onClick={handleToggleAndScroll}
							aria-label={`${childCount} ${childCount === 1 ? t('reply') : t('replies')}`}
						>
							{childCount}
						</button>
					)}
					<JoinButtons statement={statement} parentStatement={parentStatement} />
				</div>
				{showReplyInput && (
					<form className={styles['tree-option-node__reply-form']} onSubmit={handleReplySubmit}>
						<textarea
							ref={replyInputRef}
							className={styles['tree-option-node__reply-input']}
							value={replyText}
							onChange={(e) => {
								setReplyText(e.target.value);
								adjustTextareaHeight();
							}}
							onInput={adjustTextareaHeight}
							onKeyUp={handleReplyKeyUp}
							placeholder={t('Type your message here...')}
							rows={2}
							required
						/>
						<button
							type="submit"
							className={styles['tree-option-node__reply-send']}
							aria-label={t('Send')}
						>
							<SendIcon color="var(--btn-primary, #5f88e5)" />
						</button>
					</form>
				)}
				<input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} />
			</div>
		</div>
	);
};

export default React.memo(TreeOptionNode);
