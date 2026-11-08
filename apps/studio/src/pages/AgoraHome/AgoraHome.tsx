import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, EmptyState } from '@/components/atomic/atoms';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import { Loading } from '../AdminAgora/sections/LoadState';
import { useAgoraAccess } from './useAgoraAccess';
import CoordinatorOverview from './CoordinatorOverview';
import TeacherOverview from './TeacherOverview';

/**
 * `/agora` — "My Agora classrooms". A regional coordinator sees their schools,
 * teachers and classes; a teacher sees their own classes and lessons. A person
 * who is both lands on the coordinator view and reaches their own classes at
 * `/agora/mine`.
 */
export default function AgoraHome() {
	const { t } = useTranslation();
	const access = useAgoraAccess();
	const navigate = useNavigate();
	const title = t('My Agora classrooms');
	const crumbs = [{ label: title }];

	if (access.loading) {
		return (
			<StudioPage breadcrumb={crumbs} title={title}>
				<Loading />
			</StudioPage>
		);
	}

	if (access.isSupervisor) {
		return (
			<StudioPage
				breadcrumb={crumbs}
				title={title}
				actions={
					access.isTeacher ? (
						<Button
							text={t('My classes')}
							variant="secondary"
							onClick={() => navigate('/agora/mine')}
						/>
					) : undefined
				}
			>
				<CoordinatorOverview schools={access.supervisedSchools} />
			</StudioPage>
		);
	}

	if (access.isTeacher) {
		return (
			<StudioPage breadcrumb={crumbs} title={title}>
				<TeacherOverview />
			</StudioPage>
		);
	}

	return (
		<StudioPage breadcrumb={crumbs} title={title}>
			<EmptyState icon="🏫" title={t('You are not attached to an Agora school yet.')} compact />
		</StudioPage>
	);
}

/** `/agora/mine` — the teacher's own classes for someone who also coordinates. */
export function AgoraMine() {
	const { t } = useTranslation();
	const access = useAgoraAccess();
	const denied = useGrace(!access.loading && !access.isTeacher);
	const title = t('My classes');

	if (denied) return <Navigate to="/agora" replace />;

	return (
		<StudioPage
			breadcrumb={[{ label: t('My Agora classrooms'), to: '/agora' }, { label: title }]}
			title={title}
		>
			{access.loading ? <Loading /> : access.isTeacher && <TeacherOverview />}
		</StudioPage>
	);
}
