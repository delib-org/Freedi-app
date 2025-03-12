import React, { useEffect } from 'react'
import styles from './SuggestionChat.module.scss';
import Evaluation from '../statement/components/evaluations/components/evaluation/Evaluation';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import ChatInput from '../statement/components/chat/components/input/ChatInput';
import SuggestionComment from './suggestionComment/SuggestionComment';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const SuggestionChat = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const creator = useSelector(creatorSelector);
	const statement = useSelector(statementSelector(statementId));
	const comments = useSelector(statementSubsSelector(statementId));

	const creatorCommented = comments.find((comment) => comment.creator.uid === creator.uid);

	return (
		<div className={styles.suggestionChat}>
			<h1>Suggestion</h1>
			<div className={styles.evaluationPanel}>
				<Evaluation statement={statement} />
			</div>
			<p>Chat</p>
			<div className={styles.comments}>
				{comments.map((comment) => (<SuggestionComment key={comment.statementId} statement={comment} parentStatement={statement} />))}
			</div>
			{statement && !creatorCommented && <div className={styles.chatInput}>
				<ChatInput statement={statement} hasEvaluation={true} />
			</div>}
		</div>
	)
}

export default SuggestionChat
