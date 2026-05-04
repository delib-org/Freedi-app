import { FC, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { ChevronDown, ClipboardList, Database, FileSpreadsheet } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { questionsSelector } from '@/redux/statements/statementsSlice';
import JoinFormCard from '../JoinFormCard';
import styles from './SubQuestionJoinFormsCard.module.scss';

interface SubQuestionJoinFormsCardProps {
	statement: Statement;
}

const SubQuestionJoinFormsCard: FC<SubQuestionJoinFormsCardProps> = ({ statement }) => {
	const { t } = useTranslation();
	const subQuestions = useSelector(questionsSelector(statement.statementId));
	const [openId, setOpenId] = useState<string | null>(null);

	// Stable display order: oldest-first matches the natural creation order
	// admins recall when they think about "the first sub-question I made".
	const sorted = useMemo(
		() => [...subQuestions].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
		[subQuestions],
	);

	if (sorted.length === 0) return null;

	const toggleOpen = (id: string) => {
		setOpenId((prev) => (prev === id ? null : id));
	};

	return (
		<section className={styles.card}>
			<div className={styles.header}>
				<ClipboardList size={20} className={styles.header__icon} />
				<div className={styles.header__text}>
					<h3 className={styles.header__title}>{t('Per-question join forms')}</h3>
					<p className={styles.header__description}>
						{t(
							'Configure a separate join form for each sub-question. Expand a row to enable, edit fields, or pick a destination.',
						)}
					</p>
				</div>
			</div>

			<ul className={styles.list}>
				{sorted.map((question) => {
					const joinForm = question.statementSettings?.joinForm;
					const enabled = joinForm?.enabled ?? false;
					const fieldCount = joinForm?.fields?.length ?? 0;
					const destination = joinForm?.destination ?? 'firestore';
					const isOpen = openId === question.statementId;
					const title = question.statement || t('Untitled question');

					return (
						<li
							key={question.statementId}
							className={`${styles.row} ${isOpen ? styles['row--open'] : ''}`}
						>
							<button
								type="button"
								className={styles.row__header}
								onClick={() => toggleOpen(question.statementId)}
								aria-expanded={isOpen}
								aria-controls={`sub-q-join-form-body-${question.statementId}`}
							>
								<ChevronDown
									size={16}
									className={`${styles.row__chevron} ${isOpen ? styles['row__chevron--open'] : ''}`}
								/>
								<span className={styles.row__title} title={title}>
									{title}
								</span>
								<span className={styles.row__meta}>
									{enabled && fieldCount > 0 && (
										<span className={styles.row__pill}>
											{`${fieldCount} ${fieldCount === 1 ? t('field') : t('fields')}`}
										</span>
									)}
									{enabled && (
										<span
											className={styles.row__destination}
											aria-label={
												destination === 'sheets'
													? t('Submissions go to Google Sheets')
													: t('Submissions go to Firestore')
											}
											title={destination === 'sheets' ? t('Google Sheets') : t('Firestore')}
										>
											{destination === 'sheets' ? (
												<FileSpreadsheet size={14} />
											) : (
												<Database size={14} />
											)}
										</span>
									)}
									<span
										className={`${styles.row__status} ${enabled ? styles['row__status--on'] : ''}`}
									>
										{enabled ? t('On') : t('Off')}
									</span>
								</span>
							</button>

							{isOpen && (
								<div
									id={`sub-q-join-form-body-${question.statementId}`}
									className={styles.row__body}
								>
									<JoinFormCard statement={question} />
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
};

export default SubQuestionJoinFormsCard;
