import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import { useSelector } from 'react-redux'
import GeneralHeader from '@/view/components/generalHeader/GeneralHeader';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { setUserAdvanceUserToDB } from '@/controllers/db/user/setUser';

const My = () => {
	const user = useSelector(creatorSelector);
	const { t } = useUserConfig();

	function handleSetAdvanceUser() {
		setUserAdvanceUserToDB(!user?.advanceUser);
	}

	return (
		<div className='page'>
			<GeneralHeader />

			<div className="wrapper">
				<h1>{t("Hello")} {user?.displayName}</h1>
				<Checkbox
					label={t("Advance User")}
					isChecked={user?.advanceUser}
					onChange={handleSetAdvanceUser}
				/>
			</div>
		</div>
	)
}

export default My