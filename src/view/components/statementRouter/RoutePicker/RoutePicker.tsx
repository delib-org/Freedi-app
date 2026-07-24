import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
	QuestionType,
	RoutePrerequisite,
	StatementType,
	type Statement,
} from '@freedi/shared-types';
import type { RouteTarget } from '@freedi/event-core';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useOnlineStatus } from '@/controllers/hooks/useOnlineStatus';
import { useRouteTargets } from '@/controllers/statementRouter/useRouteTargets';
import { setIsDocument } from '@/controllers/db/statements/setIsDocument';
import { setQuestionType } from '@/controllers/db/statements/setQuestionType';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';
import { TIME } from '@/constants/common';
import RouteTargetRow from './RouteTargetRow';
import styles from './RoutePicker.module.scss';

const TOAST_DURATION_MS = 8 * TIME.SECOND;
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

interface RoutePickerProps {
	statement: Statement;
	isOpen: boolean;
	onClose: () => void;
}

interface RouterToast {
	text: string;
	href?: string;
	undo?: () => Promise<void>;
}

function openInNewTab(href: string): boolean {
	const opened = window.open(href, '_blank', 'noopener,noreferrer');

	return opened !== null;
}

function useIsMobileViewport(): boolean {
	const [isMobile, setIsMobile] = useState(
		() => typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
		const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
		mediaQuery.addEventListener('change', handleChange);

		return () => mediaQuery.removeEventListener('change', handleChange);
	}, []);

	return isMobile;
}

/**
 * Cross-App Statement Router — the Route Picker.
 *
 * Bottom sheet on mobile, dialog on desktop. Lists the lenses this Statement
 * can continue in (derived from ROUTE_REGISTRY — never hardcoded per card).
 * Pure-open targets are one tap; prerequisite-write targets (Sign, MC) morph
 * into an inline confirm step, write idempotently, open the tab only after
 * the write resolves, and offer Undo on the success toast.
 */
const RoutePicker: FC<RoutePickerProps> = ({ statement, isOpen, onClose }) => {
	const { t, dir } = useTranslation();
	const user = useSelector(creatorSelector);
	const { isOnline } = useOnlineStatus();
	const targets = useRouteTargets(statement);
	const isMobile = useIsMobileViewport();

	const [confirmTarget, setConfirmTarget] = useState<RouteTarget | null>(null);
	const [busy, setBusy] = useState(false);
	const [writeFailed, setWriteFailed] = useState(false);
	const [toast, setToast] = useState<RouterToast | null>(null);
	const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const showToast = useCallback((nextToast: RouterToast) => {
		if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
		setToast(nextToast);
		toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
	}, []);

	useEffect(() => {
		return () => {
			if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
		};
	}, []);

	const closePicker = useCallback(() => {
		setConfirmTarget(null);
		setWriteFailed(false);
		onClose();
	}, [onClose]);

	function openTarget(href: string): void {
		if (!openInNewTab(href)) {
			showToast({ text: t('Popup blocked'), href });
		}
	}

	function handleSelect(target: RouteTarget): void {
		if (target.state === 'disabled' || !target.href) return;

		if (target.state === 'needsMark') {
			setWriteFailed(false);
			setConfirmTarget(target);

			return;
		}

		openTarget(target.href);
		closePicker();
	}

	async function executePrerequisiteWrite(target: RouteTarget): Promise<RouterToast | null> {
		const { statementId } = statement;

		if (target.def.prerequisite === RoutePrerequisite.markDocument) {
			const success = await setIsDocument(statementId, true, user?.uid);

			if (!success) return null;

			return {
				text: t('Now a signable document'),
				undo: async () => {
					await setIsDocument(statementId, false, user?.uid);
				},
			};
		}

		const result = await setQuestionType(statementId, QuestionType.massConsensus, user?.uid);

		if (!result.success) return null;

		const previousQuestionType = result.previousQuestionType ?? QuestionType.simple;

		return {
			text: t('Now a crowd-consensus question'),
			undo: async () => {
				await setQuestionType(statementId, previousQuestionType, user?.uid);
			},
		};
	}

	async function handleConfirm(): Promise<void> {
		if (!confirmTarget?.href || busy) return;

		try {
			setBusy(true);
			setWriteFailed(false);
			const successToast = await executePrerequisiteWrite(confirmTarget);

			if (!successToast) {
				setWriteFailed(true);

				return;
			}

			// Open only after the write resolves — never optimistically.
			openTarget(confirmTarget.href);
			showToast(successToast);
			closePicker();
		} catch (error) {
			logError(error, {
				operation: 'statementRouter.RoutePicker.handleConfirm',
				statementId: statement.statementId,
				userId: user?.uid,
				metadata: { sourceApp: confirmTarget.def.sourceApp },
			});
			setWriteFailed(true);
		} finally {
			setBusy(false);
		}
	}

	async function handleStopMark(target: RouteTarget): Promise<void> {
		try {
			if (target.def.prerequisite === RoutePrerequisite.markDocument) {
				await setIsDocument(statement.statementId, false, user?.uid);
			} else {
				await setQuestionType(statement.statementId, QuestionType.simple, user?.uid);
			}
		} catch (error) {
			logError(error, {
				operation: 'statementRouter.RoutePicker.handleStopMark',
				statementId: statement.statementId,
				userId: user?.uid,
				metadata: { sourceApp: target.def.sourceApp },
			});
		}
	}

	async function handleUndo(): Promise<void> {
		if (!toast?.undo) return;

		try {
			await toast.undo();
		} catch (error) {
			logError(error, {
				operation: 'statementRouter.RoutePicker.handleUndo',
				statementId: statement.statementId,
				userId: user?.uid,
			});
		} finally {
			setToast(null);
		}
	}

	const pickerTitle =
		statement.statementType === StatementType.question
			? t('Continue this question in…')
			: t('Continue this answer in…');

	const confirmIsDocument = confirmTarget?.def.prerequisite === RoutePrerequisite.markDocument;

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={closePicker}
				title={confirmTarget ? t(confirmTarget.def.label) : pickerTitle}
				size="small"
				layout={isMobile ? 'bottom-sheet' : 'default'}
				ariaLabel={pickerTitle}
			>
				<div className={styles.picker} dir={dir}>
					{!confirmTarget && (
						<>
							<div className={styles.picker__list}>
								{targets.map((target) => (
									<RouteTargetRow
										key={target.def.sourceApp}
										target={target}
										onSelect={handleSelect}
										onStopMark={handleStopMark}
									/>
								))}
							</div>
							<p className={styles.picker__footnote}>{t('Links open in a new tab')}</p>
						</>
					)}

					{confirmTarget && (
						<div className={styles.confirm}>
							<p className={styles.confirm__statement}>“{statement.statement}”</p>
							<p className={styles.confirm__explainer}>
								{confirmIsDocument
									? t(
											'This marks the statement as a document so it opens as signable text. Nothing is copied — it is the same statement, viewed as a document. You can undo this at any time.',
										)
									: t(
											'This sets the question to crowd-consensus mode so a large crowd can suggest and rate answers anonymously. You can undo this at any time.',
										)}
							</p>
							{writeFailed && (
								<p className={styles.confirm__error} role="alert">
									{t('Could not complete the change. Try again.')}
								</p>
							)}
							<button
								type="button"
								className={styles.confirm__primary}
								onClick={handleConfirm}
								disabled={busy || !isOnline}
							>
								{!isOnline
									? t('You are offline')
									: busy
										? t('Marking…')
										: confirmIsDocument
											? t('Make document & open')
											: t('Make crowd question & open')}
							</button>
							<button
								type="button"
								className={styles.confirm__cancel}
								onClick={() => setConfirmTarget(null)}
								disabled={busy}
							>
								{t('Back')}
							</button>
						</div>
					)}
				</div>
			</Modal>

			{toast && (
				<div className={styles.toast} dir={dir} role="status">
					<span className={styles.toast__text}>{toast.text}</span>
					{toast.undo && (
						<button type="button" className={styles.toast__action} onClick={handleUndo}>
							{t('Undo')}
						</button>
					)}
					{toast.href && (
						<a
							className={styles.toast__action}
							href={toast.href}
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => setToast(null)}
						>
							{t('Open')} ⇗
						</a>
					)}
				</div>
			)}
		</>
	);
};

export default RoutePicker;
