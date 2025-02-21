import { useSelector } from 'react-redux';
import { totalMessageBoxesSelector } from '@/redux/statements/statementsSlice';
import { RootState } from '@/redux/store';
import './message-box-counter.scss';

const MessageBoxCounter = () => {
	const totalMessageBoxes = useSelector((state: RootState) =>
		totalMessageBoxesSelector(state)
	);

	// Disable eslint rule for the next line

	return (
		<div>
			<span className='boxes-counter'>{totalMessageBoxes}</span>
		</div>
	);
};

export default MessageBoxCounter;
