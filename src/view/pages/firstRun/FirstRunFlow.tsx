import { FC, useCallback, useMemo, useState, useRef } from 'react';
import { useLocation } from 'react-router';
import { useSelector } from 'react-redux';
import { User } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logOut } from '@/controllers/db/authenticationUtils';
import {
	saveTermsAcceptance,
	type SaveTermsResult,
} from '@/controllers/db/termsOfUse/termsOfUseService';
import { saveResearchConsent } from '@/controllers/db/researchLogs/researchConsentService';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { parseStatementPath } from '@/routes/statementPaths';
import { TermsOfUseAcceptance } from '@/types/agreement/Agreement';
import { logError } from '@/utils/errorHandling';
import { useDialogBehaviour } from '@/view/components/atomic/molecules/Modal/useDialogBehaviour';
import TermsStep from './TermsStep';
import NotificationsStep from './NotificationsStep';
import { useFirstRunSteps } from './useFirstRunSteps';
import styles from './FirstRunFlow.module.scss';

export interface FirstRunFlowProps {
	user: User;
	onDone: () => void;
}

/**
 * The one first-run sequence: (1) terms + optional research consent for the
 * question the user arrived at, (2) notifications (skippable). It covers the
 * page the user is already on, so a deep link lands on its question the
 * moment the flow ends; the demographic survey, when a question requires it,
 * is the existing mandatory modal that question shows next.
 */
const FirstRunFlow: FC<FirstRunFlowProps> = ({ user, onDone }) => {
	const { t, dir } = useTranslation();
	const panelRef = useRef<HTMLDivElement>(null);
	useDialogBehaviour({
		isOpen: true,
		onClose: () => undefined,
		panelRef,
		closeOnEscape: false,
		trapFocus: true,
	});
	const { pathname, search } = useLocation();
	const steps = useFirstRunSteps();
	const [index, setIndex] = useState(0);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	// Research consent is per top-level question; offer it only for the one
	// the user opened, and only if it has research logging on.
	const routeStatementId = useMemo(
		() => parseStatementPath(pathname, search)?.statementId,
		[pathname, search],
	);
	const statement = useSelector(statementSelector(routeStatementId));
	const topParent = useSelector(statementSelector(statement?.topParentId));
	const researchEnabled =
		topParent?.statementSettings?.enableResearchLogging === true ||
		statement?.statementSettings?.enableResearchLogging === true;
	const researchTopic = researchEnabled
		? (topParent?.statementId ?? statement?.statementId)
		: undefined;

	const advance = useCallback(() => {
		if (index + 1 >= steps.length) onDone();
		else setIndex(index + 1);
	}, [index, steps.length, onDone]);

	async function handleAccept(researchConsent: boolean | undefined) {
		const text = t('Agreement Description');
		const agreement: TermsOfUseAcceptance = {
			text,
			date: Date.now(),
			version: 'basic',
			userId: user.uid,
			accepted: true,
		};
		setSaveError(null);
		setIsSaving(true);
		try {
			const result: SaveTermsResult = await saveTermsAcceptance(agreement);
			if (result !== 'success') {
				setSaveError(
					result === 'blocked'
						? t(
								"We couldn't save your response. An ad blocker or privacy extension may be blocking this site — please disable it for this page and try again.",
							)
						: t('Something went wrong saving your response. Please try again.'),
				);

				return;
			}
			if (researchTopic && researchConsent !== undefined) {
				await saveResearchConsent(user.uid, researchTopic, researchConsent);
			}
			advance();
		} catch (error) {
			logError(error, { operation: 'firstRun.FirstRunFlow.handleAccept', userId: user.uid });
			setSaveError(t('Something went wrong saving your response. Please try again.'));
		} finally {
			setIsSaving(false);
		}
	}

	async function handleDecline() {
		try {
			await logOut();
		} catch (error) {
			logError(error, { operation: 'firstRun.FirstRunFlow.handleDecline', userId: user.uid });
		}
	}

	const current = steps[index];

	return (
		<div
			className={styles.overlay}
			dir={dir}
			role="dialog"
			aria-modal="true"
			aria-labelledby="first-run-title"
		>
			<div className={styles.panel} ref={panelRef} tabIndex={-1}>
				<p id="first-run-title" className={styles.progress}>
					{t('firstRun.stepOf')
						.replace('{{current}}', String(index + 1))
						.replace('{{total}}', String(steps.length))}
				</p>
				{current === 'terms' && (
					<TermsStep
						agreementText={t('Agreement Description')}
						researchTopic={researchTopic}
						error={saveError}
						isSaving={isSaving}
						onAccept={handleAccept}
						onDecline={handleDecline}
					/>
				)}
				{current === 'notifications' && <NotificationsStep onDone={advance} />}
			</div>
		</div>
	);
};

export default FirstRunFlow;
