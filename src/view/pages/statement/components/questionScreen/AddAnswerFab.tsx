import { FC, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import AddAnswerSheet from './AddAnswerSheet';
import styles from './QuestionScreen.module.scss';

const COMPOSE_PARAM = 'compose';
const COMPOSE_ANSWER = 'solution';

interface AddAnswerFabProps {
	statement: Statement;
}

/**
 * The violet "+ Add an answer" button on the answers tab, and the sheet it
 * opens. `?compose=solution` (links from elsewhere) opens the sheet directly.
 * Only mounted when adding answers is allowed for this viewer.
 */
const AddAnswerFab: FC<AddAnswerFabProps> = ({ statement }) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		if (searchParams.get(COMPOSE_PARAM) !== COMPOSE_ANSWER) return;
		const next = new URLSearchParams(searchParams);
		next.delete(COMPOSE_PARAM);
		setSearchParams(next, { replace: true });
		setOpen(true);
	}, [searchParams, setSearchParams]);

	return (
		<>
			<button
				type="button"
				className={styles.fab}
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				data-testid="add-answer-fab"
				data-cy="bottom-nav-mid-icon"
			>
				<span className={styles.fab__plus} aria-hidden="true">
					+
				</span>
				{t('Add an answer')}
			</button>
			{open && (
				<AddAnswerSheet
					key={statement.statementId}
					statement={statement}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
};

export default AddAnswerFab;
