import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import { useSelector } from 'react-redux'
import HomeHeader from '../home/HomeHeader';
import StatementHeader from '../statement/components/header/StatementHeader';
import GeneralHeader from '@/view/components/generalHeader/GeneralHeader';

const My = () => {
	const user = useSelector(creatorSelector);
	const { t } = useUserConfig();

	return (
		<div className='page'>
			<GeneralHeader />
			<h1>{t("Hello")} {user?.displayName}</h1>
		</div>
	)
}

export default My