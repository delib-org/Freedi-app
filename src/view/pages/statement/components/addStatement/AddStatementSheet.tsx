import { FC, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { QuestionType, Statement, StatementType } from '@freedi/shared-types';
import Sheet from '@/view/components/atomic/molecules/Sheet/Sheet';
import Chip from '@/view/components/atomic/atoms/Chip/Chip';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import { Button } from '@/view/components/atomic/atoms/Button';
import Input from '@/view/components/input/Input';
import Textarea from '@/view/components/textarea/Textarea';
import { MultiSuggestionPreviewModal, SplitSuggestion } from '@/view/components/multiSuggestion';
import IdeaRefineryModal from '../popperHebbian/refinery/IdeaRefineryModal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import { closePanels } from '@/controllers/hooks/panelUtils';
import { buildStatementPath } from '@/routes/statementPaths';
import { uxAnalytics } from '@/services/analytics';
import type {
	AddStatementCommit,
	AddStatementIntent,
	AddStatementOrigin,
} from '@/redux/statements/newStatementSlice';
import { INTENT_TO_TYPE } from '@/redux/statements/newStatementSlice';
import { useCreateStatementFlow } from './useCreateStatementFlow';
import SimilarAnswersInline from './SimilarAnswersInline';
import styles from './AddStatementSheet.module.scss';

export interface AddStatementSheetProps {
	isOpen: boolean;
	onClose: () => void;
	parentStatement: Statement | 'top';
	/** Starting intent; the chooser appears only when the parent allows more than one. */
	intent?: AddStatementIntent;
	/** Restrict the chooser (e.g. [option] from the answers page). */
	allowedTypes?: StatementType[];
	origin: AddStatementOrigin;
	commit?: AddStatementCommit;
	questionType?: QuestionType;
	onCreated?: (ids: string[]) => void;
}

/** Intents this parent accepts, in chooser order. */
export function allowedIntents(
	parent: Statement | 'top',
	allowedTypes?: StatementType[],
): AddStatementIntent[] {
	const candidates: AddStatementIntent[] =
		parent === 'top' ? ['question', 'group'] : ['answer', 'question'];

	return candidates.filter((intent) => {
		const type = INTENT_TO_TYPE[intent];
		if (allowedTypes && !allowedTypes.includes(type)) return false;

		return isStatementTypeAllowedAsChildren(parent, type);
	});
}

function parentTitle(parent: Statement | 'top'): string {
	return parent === 'top' ? '' : parent.statement;
}

/**
 * The one way a person adds an answer, a follow-up question or a space:
 * a sheet with the draft, then whichever AI steps the host turned on
 * (structured-debate refinery, split detection, similar answers), then create.
 */
const AddStatementSheet: FC<AddStatementSheetProps> = ({
	isOpen,
	onClose,
	parentStatement,
	intent: initialIntent,
	allowedTypes,
	origin,
	commit = 'db',
	questionType,
	onCreated,
}) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const intents = useMemo(
		() => allowedIntents(parentStatement, allowedTypes),
		[parentStatement, allowedTypes],
	);
	const [intent, setIntent] = useState<AddStatementIntent>(
		initialIntent && intents.includes(initialIntent) ? initialIntent : (intents[0] ?? 'answer'),
	);

	const isHome = location.pathname.startsWith('/home');
	const handleDone = useCallback(
		(ids: string[]) => {
			closePanels();
			onCreated?.(ids);
			if (ids[0] && (isHome || parentStatement === 'top')) {
				navigate(buildStatementPath({ statementId: ids[0] }));
			}
			onClose();
		},
		[onCreated, isHome, parentStatement, navigate, onClose],
	);

	const flow = useCreateStatementFlow({
		parentStatement,
		intent,
		origin,
		commit,
		questionType,
		onDone: handleDone,
	});
	const { state, config } = flow;

	useEffect(() => {
		if (isOpen) uxAnalytics.addAnswerStarted(flow.parentId, origin);
		// Once per open.
	}, [isOpen]);

	const handleClose = useCallback(() => {
		if (state.step === 'create' && state.pending) return;
		flow.abandon();
		onClose();
	}, [flow, onClose, state.step, state.pending]);

	const canSubmit = state.draft.title.trim().length > 0 && !state.pending && state.step === 'draft';

	const handleSubmit = (ev: FormEvent) => {
		ev.preventDefault();
		if (canSubmit) flow.submit();
	};

	const handleKeyDown = (ev: KeyboardEvent<HTMLFormElement>) => {
		if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
			ev.preventDefault();
			if (canSubmit) flow.submit();
		}
	};

	const title = parentTitle(parentStatement);
	const heading =
		intent === 'group'
			? t('question.sheet.newSpace')
			: parentStatement === 'top'
				? t('question.sheet.askQuestion')
				: t(intent === 'answer' ? 'question.sheet.answerTo' : 'question.sheet.questionFor').replace(
						'{{title}}',
						title,
					);

	const primaryLabel =
		intent === 'answer'
			? t('question.sheet.add')
			: intent === 'question'
				? t('question.sheet.ask')
				: t('question.sheet.createSpace');

	const canOfferFollowUp =
		intent === 'answer' &&
		intents.includes('question') &&
		parentStatement !== 'top' &&
		parentStatement.statementSettings?.enableAddNewSubQuestionsButton === true;

	const segments = intents.map((id) => ({
		id,
		label: t(
			id === 'answer'
				? 'question.sheet.typeAnswer'
				: id === 'question'
					? 'question.sheet.typeQuestion'
					: 'question.sheet.typeSpace',
		),
	}));

	const splitSuggestions: SplitSuggestion[] = useMemo(
		() =>
			state.splits.map((s, i) => ({
				id: `split-${i}`,
				title: s.title,
				description: s.description,
				originalText: s.title,
				isRemoved: false,
			})),
		[state.splits],
	);

	const showSplitChip = state.step === 'multiSplit' && !state.pending && state.splits.length > 1;
	const [splitOpen, setSplitOpen] = useState(false);
	useEffect(() => {
		if (showSplitChip) setSplitOpen(true);
	}, [showSplitChip]);

	const footer = (
		<div className={styles.footer}>
			{canOfferFollowUp && (
				<button
					type="button"
					className={styles.secondaryLink}
					onClick={() => setIntent('question')}
					data-testid="add-followup-instead"
				>
					{t('question.sheet.followUpInstead')}
				</button>
			)}
			<Button
				text={state.pending ? t('question.sheet.checking') : primaryLabel}
				variant="primary"
				onClick={() => canSubmit && flow.submit()}
				disabled={!canSubmit}
				loading={state.pending}
				id="add-statement-submit"
			/>
		</div>
	);

	return (
		<>
			<Sheet
				isOpen={isOpen}
				onClose={handleClose}
				title={heading}
				footer={footer}
				id="add-statement-sheet"
				className={styles.sheet}
			>
				<form
					id="add-statement-form"
					className={styles.form}
					onSubmit={handleSubmit}
					onKeyDown={handleKeyDown}
					data-testid="add-statement-form"
				>
					{intents.length > 1 && !initialIntent && (
						<SegmentedControl
							segments={segments}
							activeId={intent}
							onChange={(id) => setIntent(id as AddStatementIntent)}
							className={styles.chooser}
						/>
					)}

					<Input
						label={t('question.sheet.titleLabel')}
						placeholder={t(
							intent === 'answer'
								? 'question.sheet.titlePlaceholderAnswer'
								: intent === 'question'
									? 'question.sheet.titlePlaceholderQuestion'
									: 'question.sheet.titlePlaceholderSpace',
						)}
						name="title"
						value={state.draft.title}
						onChange={(value) => flow.setDraft({ title: value })}
						autoFocus
					/>
					<Textarea
						label={t('question.sheet.descriptionLabel')}
						placeholder={t('question.sheet.descriptionPlaceholder')}
						name="description"
						value={state.draft.description}
						onChange={(value) => flow.setDraft({ description: value })}
						minRows={2}
						maxRows={8}
					/>

					<div className={styles.chips} aria-live="polite">
						{config.preCheck && (
							<Chip
								label={t('question.sheet.preCheckChip')}
								muted
								icon={<span aria-hidden>✨</span>}
							/>
						)}
						{showSplitChip && (
							<Chip
								label={t('question.sheet.splitChip').replace(
									'{{count}}',
									String(state.splits.length),
								)}
								selected
								onClick={() => setSplitOpen(true)}
							/>
						)}
					</div>

					{state.step === 'similarity' && !state.pending && state.similar.length > 0 && (
						<SimilarAnswersInline
							similar={state.similar}
							onSupport={flow.similarity.support}
							onContinue={flow.similarity.continueOwn}
							onBack={flow.similarity.back}
						/>
					)}

					{state.step === 'error' && (
						<div className={styles.error} role="alert">
							<p>{t(state.error ?? 'question.sheet.errorGeneric')}</p>
							<Button text={t('question.sheet.retry')} variant="secondary" onClick={flow.retry} />
						</div>
					)}
				</form>
			</Sheet>

			{state.step === 'structuredDebatePreCheck' && parentStatement !== 'top' && (
				<IdeaRefineryModal
					parentStatementId={parentStatement.statementId}
					originalIdea={
						state.draft.description
							? `${state.draft.title}\n${state.draft.description}`
							: state.draft.title
					}
					onClose={flow.preCheck.close}
					onPublish={(refined) => flow.preCheck.publish(refined)}
				/>
			)}

			{showSplitChip && splitOpen && (
				<MultiSuggestionPreviewModal
					originalText={
						state.draft.title + (state.draft.description ? `: ${state.draft.description}` : '')
					}
					suggestions={splitSuggestions}
					onConfirm={(items) =>
						flow.multi.confirm(items.map((s) => ({ title: s.title, description: s.description })))
					}
					onDismiss={() => {
						setSplitOpen(false);
						flow.multi.dismiss();
					}}
					onCancel={() => {
						setSplitOpen(false);
						flow.multi.cancel();
					}}
					isSubmitting={false}
				/>
			)}
		</>
	);
};

export default AddStatementSheet;
