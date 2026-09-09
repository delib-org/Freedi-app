import { FC, FormEvent, useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import ToneCard from '@/view/components/atomic/molecules/ToneCard';
import Eyebrow from '@/view/components/atomic/atoms/Eyebrow';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { createImprovedAnswer } from '@/controllers/db/statements/createImprovedAnswer';
import { buildStatementPath } from '@/routes/statementPaths';
import { StatementContext } from '../../StatementCont';
import { canParticipantsAddAnswers } from '../questionScreen/questionScreenLogic';
import styles from './AnswerImprovement.module.scss';

/**
 * On an answer's Discussion tab: "Improve this answer together". Links to
 * the answers this one was improved from, and lets a member propose better
 * wording — which becomes a new answer under the same question, so earlier
 * ratings stay with the original.
 */
const AnswerImprovement: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { statement } = useContext(StatementContext);
	const parent = useSelector(statementSelector(statement?.parentId));
	const { isAuthorized, isAdmin: isHost } = useAuthorization(parent?.statementId);
	const { isHalted } = useIsProcessHalted(parent);
	const [text, setText] = useState(statement?.statement ?? '');
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!statement || !parent) return null;

	const allowed = !isHalted && (isHost || (isAuthorized && canParticipantsAddAnswers(parent)));
	const sources = (statement.paragraphs ?? []).filter((p) => p.sourceStatementId);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!statement || !parent || !allowed || busy) return;
		setBusy(true);
		setError(null);
		try {
			const saved = await createImprovedAnswer({ source: statement, parent, text, reason });
			navigate(buildStatementPath({ statementId: saved.statementId, view: 'chat' }));
		} catch {
			setError(t('improve.failed'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<ToneCard tone="peach" className={styles.card} data-testid="answer-improvement">
			<Eyebrow inherit icon={<Sparkles aria-hidden="true" focusable="false" />}>
				{t('improve.title')}
			</Eyebrow>
			<p className="tone-card__muted">{t('improve.body')}</p>
			{sources.length > 0 && (
				<ul className={styles.sources}>
					{sources.map((p) => (
						<li key={p.paragraphId}>
							<Link
								to={buildStatementPath({
									statementId: p.sourceStatementId as string,
									view: 'chat',
								})}
								className={styles.source}
							>
								{t('improve.compareSource')}
								<ArrowUpRight size={14} aria-hidden="true" />
							</Link>
						</li>
					))}
				</ul>
			)}
			{allowed && (
				<details className={styles.details}>
					<summary className={styles.summary}>{t('improve.propose')}</summary>
					<form onSubmit={submit} className={styles.form} data-testid="answer-improvement-form">
						<label className={styles.label} htmlFor="improved-wording">
							{t('improve.wording')}
						</label>
						<textarea
							id="improved-wording"
							className={styles.textarea}
							value={text}
							onChange={(e) => setText(e.target.value)}
							required
						/>
						<label className={styles.label} htmlFor="improvement-reason">
							{t('improve.reason')}
						</label>
						<textarea
							id="improvement-reason"
							className={styles.textarea}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							required
						/>
						<div className="tone-card__actions">
							<button
								type="submit"
								className="button button--primary"
								disabled={busy || !text.trim() || !reason.trim()}
							>
								{busy ? t('improve.saving') : t('improve.submit')}
							</button>
						</div>
					</form>
				</details>
			)}
			{error && (
				<p role="alert" className={styles.error}>
					{error}
				</p>
			)}
		</ToneCard>
	);
};

/** Whether the card belongs on this screen: an answer (not a merged group) on its Discussion tab. */
export function showsAnswerImprovement(
	statement: Statement | undefined,
	activeTab: string,
): boolean {
	return Boolean(
		statement &&
			statement.statementType === 'option' &&
			!statement.isCluster &&
			activeTab === 'chat',
	);
}

export default AnswerImprovement;
