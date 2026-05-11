import { FC, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Paragraph, ParagraphType, Role, Statement, StatementType } from '@freedi/shared-types';
import Button from '@/view/components/atomic/atoms/Button/Button';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatement, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import { generateParagraphId } from '@/utils/paragraphUtils';
import { createStatement } from '@/controllers/db/statements/createStatement';
import { setStatementToDB } from '@/controllers/db/statements/writeStatement';
import { parseBulkOptions } from './parseBulkOptions';
import styles from './BulkAddOptions.module.scss';

interface BulkAddOptionsProps {
	statement: Statement;
}

type Status =
	| { kind: 'idle' }
	| { kind: 'loading' }
	| { kind: 'success'; count: number }
	| { kind: 'error'; line: number };

function descriptionToParagraphs(description: string): Paragraph[] | undefined {
	const trimmed = description.trim();
	if (!trimmed) return undefined;

	return [
		{
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: trimmed,
			order: 0,
		},
	];
}

const BulkAddOptions: FC<BulkAddOptionsProps> = ({ statement }) => {
	const { t, dir } = useTranslation();
	const { creator } = useAuthentication();
	const dispatch = useDispatch();
	const subscription = useSelector(statementSubscriptionSelector(statement.statementId));

	const [value, setValue] = useState('');
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const [isSubmitting, setIsSubmitting] = useState(false);

	const parsed = useMemo(() => parseBulkOptions(value), [value]);
	const isAdmin = subscription?.role === Role.admin || subscription?.role === Role.creator;
	const isQuestion = statement.statementType === StatementType.question;

	if (!isAdmin || !isQuestion) return null;

	const isSuccess = status.kind === 'success';
	const canSubmit = parsed.length > 0 && !isSubmitting && !isSuccess && !!creator;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		setStatus({ kind: 'loading' });

		try {
			for (let i = 0; i < parsed.length; i++) {
				const item = parsed[i];
				try {
					const newStatement = createStatement({
						text: item.title,
						paragraphs: descriptionToParagraphs(item.description),
						parentStatement: statement,
						statementType: StatementType.option,
						hasChildren: true,
					});
					if (!newStatement) {
						throw new Error(`createStatement returned undefined for line ${i + 1}`);
					}

					const writeResult = await setStatementToDB({
						statement: newStatement,
						parentStatement: statement,
					});
					if (!writeResult) {
						throw new Error(`setStatementToDB returned undefined for line ${i + 1}`);
					}

					dispatch(setStatement(newStatement));
				} catch (error) {
					logError(error, {
						operation: 'BulkAddOptions.handleSubmit',
						userId: creator?.uid,
						statementId: statement.statementId,
						metadata: {
							lineIndex: i,
							total: parsed.length,
							title: item.title,
						},
					});
					setStatus({ kind: 'error', line: i + 1 });

					return;
				}
			}

			setStatus({ kind: 'success', count: parsed.length });
			// Keep `value` so the user can see what was just added.
			// Editing the textarea or clicking Clear resets status to idle.
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClear = () => {
		setValue('');
		setStatus({ kind: 'idle' });
	};

	const submitLabel = isSubmitting
		? t('Adding...')
		: t('Add {{count}} options').replace('{{count}}', String(parsed.length));

	return (
		<section className={styles.bulkAddOptions} aria-labelledby="bulk-add-options-heading" dir={dir}>
			<h3 id="bulk-add-options-heading" className={styles.bulkAddOptions__heading}>
				{t('Bulk add options')}
			</h3>
			<p className={styles.bulkAddOptions__hint}>
				{t('Paste options, one per line. Use a dash (—) for an optional description.')}
			</p>

			<textarea
				className={styles.bulkAddOptions__textarea}
				value={value}
				onChange={(e) => {
					setValue(e.target.value);
					if (status.kind !== 'idle' && status.kind !== 'loading') {
						setStatus({ kind: 'idle' });
					}
				}}
				rows={10}
				dir="auto"
				placeholder={t('Paste options, one per line. Use a dash (—) for an optional description.')}
				disabled={isSubmitting}
				aria-label={t('Bulk add options')}
			/>

			{parsed.length > 0 && (
				<div className={styles.bulkAddOptions__preview}>
					<h4 className={styles.bulkAddOptions__previewHeading}>
						{t('Preview ({{count}})').replace('{{count}}', String(parsed.length))}
					</h4>
					<ol className={styles.bulkAddOptions__previewList}>
						{parsed.map((item, i) => (
							<li key={i} className={styles.bulkAddOptions__previewItem} dir="auto">
								<span className={styles.bulkAddOptions__previewTitle}>{item.title}</span>
								{item.description && (
									<span className={styles.bulkAddOptions__previewDescription}>
										{` — ${item.description}`}
									</span>
								)}
							</li>
						))}
					</ol>
				</div>
			)}

			<div className={styles.bulkAddOptions__actions}>
				<Button
					text={submitLabel}
					variant="primary"
					loading={isSubmitting}
					disabled={!canSubmit}
					onClick={handleSubmit}
				/>
				<Button
					text={t('Clear')}
					variant="secondary"
					disabled={isSubmitting || (!value && status.kind === 'idle')}
					onClick={handleClear}
				/>
			</div>

			{status.kind === 'success' && (
				<p className={styles['bulkAddOptions__status--success']} role="status">
					{t('Added {{count}} options').replace('{{count}}', String(status.count))}
				</p>
			)}
			{status.kind === 'error' && (
				<p className={styles['bulkAddOptions__status--error']} role="alert">
					{t('Failed to add options at line {{line}}').replace('{{line}}', String(status.line))}
				</p>
			)}
		</section>
	);
};

export default BulkAddOptions;
