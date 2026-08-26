import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
	StudioExistingActivitySnapshot,
	StudioPlan,
	StudioPlanBuildResult,
	StudioPlanMessage,
	StudioPlanSession,
} from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { studioPlanBuild, studioPlanMessage, studioPlanStart } from '@/db/orgFunctions';
import { useStudioPlanSession } from '@/db/studioPlan';
import { getErrorCode } from '@/pages/_shared/callableErrors';
import { logError } from '@/utils/logError';
import { computeChangedTempIds } from './planDiff';
import { CHANGED_FLASH_MS, type PlanPhase } from './planTypes';

/**
 * State machine of one "Start a question with AI" conversation.
 *
 * The Firestore session document is the source of truth. Callable results
 * are only an *overlay* shown until the snapshot catches up: each overlaid
 * message knows the index it will occupy in the document, so the moment the
 * document is that long the overlay is dropped — no duplicates, no flicker.
 *
 * Starting is guarded by a ref keyed `${orgId}:${qId ?? 'new'}` so React 18
 * StrictMode's double effect never opens two sessions; `?session=` resumes.
 */
export const SESSION_PARAM = 'session';

export interface UsePlanSessionOptions {
	orgId: string;
	/** Existing-question mode. */
	qId?: string;
	/** Start only once the caller knows the user may plan (org loaded, canManage). */
	enabled: boolean;
}

export interface UsePlanSessionResult {
	phase: PlanPhase;
	sessionId: string | null;
	session: StudioPlanSession | null;
	messages: StudioPlanMessage[];
	plan: StudioPlan | undefined;
	planVersion: number;
	readyToBuild: boolean;
	problems: string[];
	changedTempIds: string[];
	existingActivities: StudioExistingActivitySnapshot[];
	/** When the in-flight turn started (for the "Still working…" hint). */
	waitingSince: number | null;
	/** The last user message that could not be sent. */
	failedMessage: string | null;
	/** Translated, user-facing error of the last failed start / turn. */
	error: string | null;
	buildError: string | null;
	buildResult: StudioPlanBuildResult | null;
	/** True when this page instance ran the build (→ navigate); false on a resumed built session. */
	builtHere: boolean;
	send: (text: string) => Promise<void>;
	retry: () => Promise<void>;
	build: () => Promise<void>;
}

interface OverlayMessage {
	/** Index this message will have in the session document. */
	expectedIndex: number;
	message: StudioPlanMessage;
}

interface PlanOverlay {
	plan?: StudioPlan;
	planVersion: number;
	readyToBuild: boolean;
}

function resolveTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

function describeError(error: unknown, t: (key: string) => string): string {
	const code = getErrorCode(error) ?? '';
	if (code.endsWith('resource-exhausted')) {
		return t("You've reached the limit for now. Please try again in a little while.");
	}
	if (code.endsWith('failed-precondition')) return t('This plan can no longer be changed.');

	return t('Could not reach the consultant. Please try again.');
}

export function usePlanSession({
	orgId,
	qId,
	enabled,
}: UsePlanSessionOptions): UsePlanSessionResult {
	const { t, currentLanguage } = useTranslation();
	const [searchParams, setSearchParams] = useSearchParams();
	const sessionId = searchParams.get(SESSION_PARAM);

	const snapshot = useStudioPlanSession(sessionId);
	const session = snapshot.data;
	const baseMessages = useMemo(() => session?.messages ?? [], [session]);

	const [overlayMessages, setOverlayMessages] = useState<OverlayMessage[]>([]);
	const [planOverlay, setPlanOverlay] = useState<PlanOverlay | null>(null);
	const [startExisting, setStartExisting] = useState<StudioExistingActivitySnapshot[]>([]);
	const [problems, setProblems] = useState<string[]>([]);
	const [sending, setSending] = useState(false);
	const [waitingSince, setWaitingSince] = useState<number | null>(null);
	const [failedMessage, setFailedMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [startError, setStartError] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);
	const [buildError, setBuildError] = useState<string | null>(null);
	const [buildResult, setBuildResult] = useState<StudioPlanBuildResult | null>(null);
	const [builtHere, setBuiltHere] = useState(false);
	const [changedTempIds, setChangedTempIds] = useState<string[]>([]);

	// StrictMode runs effects twice on the same instance; refs survive that,
	// an `active` flag in the cleanup would not (it would drop the response).
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
		};
	}, []);

	// --- Start ---------------------------------------------------------------
	const startedKeyRef = useRef<string | null>(null);
	useEffect(() => {
		if (!enabled || sessionId) return;
		const key = `${orgId}:${qId ?? 'new'}`;
		if (startedKeyRef.current === key) return;
		startedKeyRef.current = key;

		setStartError(null);
		setWaitingSince(Date.now());
		studioPlanStart({
			organizationId: orgId,
			topQuestionId: qId,
			language: currentLanguage,
			timezone: resolveTimezone(),
		})
			.then((result) => {
				if (!mountedRef.current) return;
				setOverlayMessages([{ expectedIndex: 0, message: result.message }]);
				if (result.plan) setPlanOverlay({ plan: result.plan, planVersion: 1, readyToBuild: false });
				setStartExisting(result.existingActivities ?? []);
				setSearchParams(
					(prev) => {
						const next = new URLSearchParams(prev);
						next.set(SESSION_PARAM, result.sessionId);

						return next;
					},
					{ replace: true },
				);
			})
			.catch((err: unknown) => {
				logError(err, {
					operation: 'usePlanSession.start',
					organizationId: orgId,
					statementId: qId,
				});
				if (mountedRef.current) setStartError(describeError(err, t));
			})
			.finally(() => {
				if (mountedRef.current) setWaitingSince(null);
			});
	}, [enabled, sessionId, orgId, qId, currentLanguage, setSearchParams, t]);

	// --- Overlay reconciliation ---------------------------------------------
	const messages = useMemo(() => {
		const extras = overlayMessages
			.filter((m) => baseMessages.length <= m.expectedIndex)
			.map((m) => m.message);

		return extras.length > 0 ? [...baseMessages, ...extras] : baseMessages;
	}, [baseMessages, overlayMessages]);

	useEffect(() => {
		setOverlayMessages((prev) => {
			const kept = prev.filter((m) => baseMessages.length <= m.expectedIndex);

			return kept.length === prev.length ? prev : kept;
		});
	}, [baseMessages.length]);

	const sessionVersion = session?.planVersion ?? 0;
	const overlayNewer = planOverlay !== null && sessionVersion < planOverlay.planVersion;
	const plan = overlayNewer ? planOverlay.plan : (session?.currentPlan ?? planOverlay?.plan);
	const planVersion = Math.max(sessionVersion, planOverlay?.planVersion ?? 0);
	const readyToBuild = overlayNewer
		? planOverlay.readyToBuild
		: (session?.readyToBuild ?? planOverlay?.readyToBuild ?? false);

	// --- Changed rows flash --------------------------------------------------
	const prevPlanRef = useRef<StudioPlan | undefined>(undefined);
	useEffect(() => {
		const changed = computeChangedTempIds(prevPlanRef.current, plan);
		prevPlanRef.current = plan;
		if (changed.length === 0) return;
		setChangedTempIds(changed);
		const timer = window.setTimeout(() => setChangedTempIds([]), CHANGED_FLASH_MS);

		return () => window.clearTimeout(timer);
	}, [plan]);

	// --- Turns ---------------------------------------------------------------
	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	const send = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!sessionId || !trimmed || sending) return;

			const userIndex = messagesRef.current.length;
			const user: StudioPlanMessage = { role: 'user', content: trimmed, createdAt: Date.now() };
			setOverlayMessages((prev) => [...prev, { expectedIndex: userIndex, message: user }]);
			setFailedMessage(null);
			setError(null);
			setSending(true);
			setWaitingSince(Date.now());
			try {
				const result = await studioPlanMessage({ sessionId, message: trimmed });
				if (!mountedRef.current) return;
				setOverlayMessages((prev) => [
					...prev,
					{ expectedIndex: userIndex + 1, message: result.message },
				]);
				setPlanOverlay((prev) =>
					result.plan
						? {
								plan: result.plan,
								planVersion: result.planVersion,
								readyToBuild: result.readyToBuild,
							}
						: prev
							? { ...prev, readyToBuild: result.readyToBuild }
							: null,
				);
				setProblems(result.problems ?? []);
			} catch (err) {
				logError(err, {
					operation: 'usePlanSession.send',
					organizationId: orgId,
					metadata: { sessionId, length: trimmed.length },
				});
				if (!mountedRef.current) return;
				setOverlayMessages((prev) => prev.filter((m) => m.message !== user));
				setFailedMessage(trimmed);
				setError(describeError(err, t));
			} finally {
				if (mountedRef.current) {
					setSending(false);
					setWaitingSince(null);
				}
			}
		},
		[sessionId, sending, orgId, t],
	);

	const retry = useCallback(async () => {
		if (failedMessage) await send(failedMessage);
	}, [failedMessage, send]);

	// --- Build ---------------------------------------------------------------
	const build = useCallback(async () => {
		if (!sessionId || building) return;
		setBuilding(true);
		setBuildError(null);
		try {
			const result = await studioPlanBuild({ sessionId });
			if (!mountedRef.current) return;
			setBuildResult(result);
			setBuiltHere(true);
		} catch (err) {
			logError(err, {
				operation: 'usePlanSession.build',
				organizationId: orgId,
				metadata: { sessionId },
			});
			if (mountedRef.current) setBuildError(t('Could not build the plan. Please try again.'));
		} finally {
			if (mountedRef.current) setBuilding(false);
		}
	}, [sessionId, building, orgId, t]);

	// --- Phase ---------------------------------------------------------------
	const sessionMissing = Boolean(sessionId) && !snapshot.loading && !session;
	const phase = useMemo<PlanPhase>(() => {
		if (startError || snapshot.error || (sessionMissing && overlayMessages.length === 0)) {
			return 'error';
		}
		if (builtHere || session?.status === 'built') return 'built';
		if (building || session?.status === 'building') return 'building';
		if (sending) return 'waiting';
		if (!session && overlayMessages.length === 0) return 'starting';

		return 'chatting';
	}, [
		startError,
		snapshot.error,
		sessionMissing,
		overlayMessages.length,
		builtHere,
		session,
		building,
		sending,
	]);

	const phaseError =
		startError ??
		(snapshot.error || sessionMissing ? t('This planning session could not be found.') : null);

	return {
		phase,
		sessionId,
		session,
		messages,
		plan,
		planVersion,
		readyToBuild,
		problems,
		changedTempIds,
		existingActivities: session?.existingActivities ?? startExisting,
		waitingSince,
		failedMessage,
		error: error ?? (phase === 'error' ? phaseError : null),
		buildError,
		buildResult,
		builtHere,
		send,
		retry,
		build,
	};
}
