import { Dispatch, FC } from 'react';
import styles from './EmptyScreen.module.scss';
import ideaImage from '@/assets/images/manWithIdeaLamp.png';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import useWindowDimensions from '@/controllers/hooks/useWindowDimentions';

// /graphics
import WhitePlusIcon from '@/view/components/icons/WhitePlusIcon';
import { useDispatch } from 'react-redux';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import { Statement, StatementType } from 'delib-npm';

interface Props {
	statement: Statement;
}

const EmptyScreen: FC<Props> = ({ statement }) => {
	const dispatch = useDispatch();
	const { t } = useUserConfig();
	const { width } = useWindowDimensions();
	const smallScreen = width < 1024;

	function handleCreateNewOption() {
			dispatch(setNewStatementModal({
				parentStatement: statement,
				newStatement: {
					statementType: StatementType.option,
				},
				showModal: true,
				isLoading: false,
				error: null,
			}))
		}

	

	return (
		<div
			className={styles.addingStatementWrapper}
			style={{ paddingTop: '2rem' }}
		>
			<div className={styles.header}>
				<div className={styles.title}>
					<h1 className={styles.h1}>
						{smallScreen ? (
							<>
								{t('Click on')}{' '}
								<span className={styles.titleSpan}>
									{t('Add suggestion button')}
								</span>{' '}
								{t('to add your suggestion')}
							</>
						) : (
							<>
								{t('Click on')}{' '}
								<span className={styles.titleSpan}>
									{t('Add suggestion button')}
								</span>
								<br />
								{t('to add your suggestion')}
							</>
						)}
					</h1>
				</div>
				<button
					className={styles.plusButton}
					onClick={handleCreateNewOption}
					style={smallScreen ? { width: '4rem', height: '4rem' } : {}}
				>
					{smallScreen ? (
						<WhitePlusIcon />
					) : (
						<p>
							{t('Add suggestion')} <WhitePlusIcon />
						</p>
					)}
				</button>
			</div>
			<img src={ideaImage} alt={t('Compose your suggestion')} className={styles.ideaImage} />
		</div>
	);
};

export default EmptyScreen;
