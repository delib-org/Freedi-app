import React, { useContext, useState, useMemo, useRef } from 'react';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';

import { StatementContext } from '../../StatementCont';
import styles from './Switch.module.scss';
import { Role, StatementType } from '@freedi/shared-types';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import SwitchScreen from './SwitchScreen';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import OnlineUsers from '../nav/online/OnlineUsers';

import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useHeaderHideOnScroll } from '@/controllers/hooks/useHeaderHideOnScroll';
import {
	statementSubsSelector,
	statementOptionsSelector,
	questionsSelector,
} from '@/redux/statements/statementsSlice';

const MAIN_SCREENS = new Set(['main', undefined, 'chat', 'options', 'questions']);

const Switch = () => {
	const { t } = useTranslation();
	const { screen } = useParams();
	const { statement } = useContext(StatementContext);
	const { role } = useAuthorization(statement?.statementId);
	const isAdmin = role === Role.admin || role === Role.creator;

	const defaultView = statement?.statementSettings?.defaultView ?? 'chat';
	const [activeView, setActiveView] = useState<string>(defaultView);
	const [edit, setEdit] = useState(false);

	const mainRef = useRef<HTMLElement>(null);
	useHeaderHideOnScroll(mainRef);

	const subsSelect = useMemo(() => statementSubsSelector(statement?.statementId), [statement?.statementId]);
	const optionsSelect = useMemo(() => statementOptionsSelector(statement?.statementId), [statement?.statementId]);
	const questionsSelect = useMemo(() => questionsSelector(statement?.statementId), [statement?.statementId]);

	const allSubs = useSelector(subsSelect);
	const options = useSelector(optionsSelect);
	const questions = useSelector(questionsSelect);

	const segments = useMemo(() => {
		const allSegments = [
			{ id: 'chat', label: t('Chat'), count: allSubs.length },
			...(statement && isStatementTypeAllowedAsChildren(statement, StatementType.option)
				? [{ id: 'options', label: t('Options'), count: options.length }]
				: []),
			...(statement && isStatementTypeAllowedAsChildren(statement, StatementType.question)
				? [{ id: 'questions', label: t('Questions'), count: questions.length }]
				: []),
		];

		return allSegments;
	}, [t, allSubs.length, options.length, questions.length, statement]);

	const showSegmentedControl = MAIN_SCREENS.has(screen);

	function handleUpdateStatement(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Enter') {
			const title = (e.target as HTMLInputElement).value;

			updateStatementText(statement, title);
			setEdit(false);
		}
	}

	function handleStartEdit() {
		if (isAdmin) {
			setEdit(true);
		}
	}

	return (
		<main ref={mainRef} className="page__main">
			<div className={styles.stickyTop}>
				<div className={styles.stickyTopInner}>
					{isAdmin ? (
						<button className={styles.header} onClick={handleStartEdit}>
							{!edit ? (
								<h1>{renderInlineMarkdown(statement?.statement)}</h1>
							) : (
								<h1>
									<input
										type="text"
										defaultValue={statement?.statement}
										onBlur={() => setEdit(false)}
										onKeyUp={handleUpdateStatement}
									/>
								</h1>
							)}
						</button>
					) : (
						<div className={styles.header}>
							<h1>{renderInlineMarkdown(statement?.statement)}</h1>
						</div>
					)}

					{showSegmentedControl && (
						<div className={styles.segmentedControlWrapper}>
							<SegmentedControl segments={segments} activeId={activeView} onChange={setActiveView} />
						</div>
					)}
				</div>
			</div>

			<OnlineUsers statementId={statement?.statementId} />
			<SwitchScreen statement={statement} role={role} activeView={activeView} />
		</main>
	);
};

export default Switch;
