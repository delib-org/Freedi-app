import { logError } from '@/utils/errorHandling';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import React, { FormEvent, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import { ParagraphType, Statement, StatementType } from '@freedi/shared-types';
import { statementSelectorById, setStatement } from '@/redux/statements/statementsSlice';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createStatement } from '@/controllers/db/statements/createStatement';
import { setStatementToDB } from '@/controllers/db/statements/writeStatement';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { useMemo } from 'react';
import styles from './Agreement.module.scss';

export default function OptionImprovement({ statement }: { statement: Statement }) {
	const dispatch = useAppDispatch();
	const parentSelector = useMemo(
		() => statementSelectorById(statement.parentId),
		[statement.parentId],
	);
	const parent = useSelector(parentSelector);
	const authorization = useAuthorization(parent?.statementId);
	const { isAuthorized } = authorization;
	const isAdmin =
		authorization.isAdmin ||
		(!!authorization.creator?.uid &&
			(parent?.creatorId === authorization.creator.uid ||
				parent?.creator?.uid === authorization.creator.uid));
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const { isHalted } = useIsProcessHalted(parent);
	const allowed =
		!isHalted &&
		parent &&
		(isAdmin || (isAuthorized && parent.statementSettings?.enableAddEvaluationOption === true));
	const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
		event.preventDefault();
		if (!parent || !allowed || busy) return;
		const data = new FormData(event.currentTarget);
		const text = String(data.get('wording') ?? '').trim();
		const reason = String(data.get('reason') ?? '').trim();
		if (!text || !reason || text === statement.statement) return;
		setBusy(true);
		setError('');
		try {
			const next = createStatement({
				text,
				parentStatement: parent,
				statementType: StatementType.option,
				membership: parent.membership,
				paragraphs: [
					{
						paragraphId: crypto.randomUUID(),
						type: ParagraphType.paragraph,
						content: reason,
						sourceStatementId: statement.statementId,
						order: 0,
					},
				],
			});
			if (!next) throw new Error(t('Could not prepare the draft.'));
			const saved = await setStatementToDB({ statement: next, parentStatement: parent });
			if (!saved) throw new Error(t('Could not save the draft. Please try again.'));
			dispatch(setStatement(saved.statement));
			navigate(`/statement/${saved.statementId}?tab=chat`);
		} catch (e) {
			if (!(e instanceof Error && e.name === 'AbortError'))
				logError(e, { operation: 'OptionImprovement' });
			setError(t('Could not save the draft.'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className={styles.journey}>
			<div className={styles.journey__card} data-tone="peach">
				<h3>{t('Improve the option together')}</h3>
				<p>
					{t(
						'Discuss concerns below. Offer better wording as a new option so earlier evaluations stay with the original.',
					)}
				</p>
				{statement.paragraphs
					?.filter((p) => p.sourceStatementId)
					.map((p) => (
						<div className={styles.journey__actions} key={p.paragraphId}>
							<button onClick={() => navigate(`/statement/${p.sourceStatementId}?tab=chat`)}>
								{t('Compare the source option')} ↗
							</button>
						</div>
					))}
				{allowed && (
					<details>
						<summary>{t('Propose improved wording')}</summary>
						<form onSubmit={submit}>
							<label htmlFor="improved-wording">{t('Proposed wording')}</label>
							<textarea
								id="improved-wording"
								name="wording"
								defaultValue={statement.statement}
								required
							/>
							<label htmlFor="improvement-reason">{t('Which concerns does this address?')}</label>
							<textarea id="improvement-reason" name="reason" required />
							<div className={styles.journey__actions}>
								<button className={styles.journey__primary} disabled={busy}>
									{busy ? t('Saving…') : t('Create revised option')}
								</button>
							</div>
						</form>
					</details>
				)}
				{error && <p role="alert">{error}</p>}
			</div>
		</section>
	);
}
