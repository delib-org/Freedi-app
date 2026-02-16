import { useSelector } from 'react-redux';
import { totalMessageBoxesSelector } from '@/redux/statements/statementsSlice';
import { RootState } from '@/redux/store';
import styles from './message-box-counter.module.scss';

const MessageBoxCounter = () => {
	const totalMessageBoxes = useSelector((state: RootState) => totalMessageBoxesSelector(state));

	// Disable eslint rule for the next line

	return (
		<div>
			<span className={styles.boxesCounter}>{totalMessageBoxes}</span>
		</div>
	);
};

export default MessageBoxCounter;
