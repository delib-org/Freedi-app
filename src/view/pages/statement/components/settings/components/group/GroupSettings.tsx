import React from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const GroupSettings = () => {
	const { t } = useUserConfig();

	return (
		<div>
			<SectionTitle title={t('Group settings')} />
			<h3>test</h3>
		</div>
	)
}

export default GroupSettings