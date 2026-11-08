import { useEffect, useMemo, useState } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { statementSelector } from '@/redux/statements/statementsSlice';

/**
 * Level transitions (WizCol slice 7).
 *
 * Three levels: tabs (home / inbox / me) → question → map. Going deeper pushes
 * (the incoming screen slides in from the reading-forward side), going up pops
 * (the incoming screen rises from underneath). The direction is derived from
 * React Router — the paths' depth and the navigation type — never from a
 * mirrored state field. Only transform and opacity animate, and the class is
 * dropped once the animation has run so `will-change` does not linger.
 *
 * Each level is a different route element under a different layout (Home,
 * ProtectedLayout, the profile layout), so the leaving screen unmounts the
 * moment the location changes; only the incoming screen animates.
 */

export type NavigationLevel = 0 | 1 | 2;
export type LevelDirection = 'push' | 'pop' | 'none';
export type LevelNavigationType = `${NavigationType}`;

/** --level-duration (320ms) plus a frame of slack before the class is removed. */
export const LEVEL_TRANSITION_MS = 360;

const MAP_SCREENS = new Set([
	'mind-map',
	'agreement-map',
	'polarization-index',
	'sub-questions-map',
	'cluster-board',
]);
const STATEMENT_PATH = /^\/(statement|stage|statement-screen)\/([^/?#]+)(?:\/([^/?#]+))?/;

export function statementIdFromPath(pathname: string | null | undefined): string | undefined {
	const match = pathname?.match(STATEMENT_PATH);

	return match ? decodeURIComponent(match[2]) : undefined;
}

/** 0 = tab level (home, inbox, me), 1 = a question, 2 = a full-screen map. */
export function getNavigationLevel(pathname: string): NavigationLevel {
	if (/^\/map(\/|$)/.test(pathname)) return 2;
	const match = pathname.match(STATEMENT_PATH);
	if (match) return match[3] && MAP_SCREENS.has(match[3]) ? 2 : 1;
	if (/^\/(home|my)(\/|$)/.test(pathname) || pathname === '/') return 0;

	return 1;
}

export interface LevelTransitionInput {
	fromPath: string | null;
	toPath: string;
	navigationType: LevelNavigationType;
	/** The destination statement is the parent of the one being left. */
	toIsParentOfFrom?: boolean;
}

export function resolveLevelTransition({
	fromPath,
	toPath,
	navigationType,
	toIsParentOfFrom = false,
}: LevelTransitionInput): LevelDirection {
	if (!fromPath || fromPath === toPath) return 'none';
	const from = getNavigationLevel(fromPath);
	const to = getNavigationLevel(toPath);
	if (to > from) return 'push';
	if (to < from) return 'pop';
	if (to === 0) return 'none';

	const fromId = statementIdFromPath(fromPath);
	const toId = statementIdFromPath(toPath);
	if (!fromId || !toId || fromId === toId) return 'none';
	if (navigationType === NavigationType.Pop || toIsParentOfFrom) return 'pop';

	return 'push';
}

export function levelTransitionClass(direction: LevelDirection, dir: 'ltr' | 'rtl'): string {
	if (direction === 'none') return '';

	return `level-transition level-transition--${direction} level-transition--${dir}`;
}

// The path the person was on before the current location. Screens mount and
// unmount per level, so this has to outlive any one component. The first
// component that renders a location captures its origin; every other one
// rendering the same location reads the same answer.
let lastPathname: string | null = null;
let captured: { key: string; fromPath: string | null } | null = null;

function originFor(locationKey: string): string | null {
	if (captured?.key !== locationKey) captured = { key: locationKey, fromPath: lastPathname };

	return captured.fromPath;
}

/** Test-only: forget the navigation history. */
export function resetLevelTransitionHistory(): void {
	lastPathname = null;
	captured = null;
}

interface LevelTransitionResult {
	direction: LevelDirection;
	className: string;
	fromPath: string | null;
}

function useLevelTransitionFor(toIsParentOfFrom = false): LevelTransitionResult {
	const location = useLocation();
	const navigationType = useNavigationType();
	const { dir } = useTranslation();
	const fromPath = originFor(location.key);
	const direction = useMemo(
		() =>
			resolveLevelTransition({
				fromPath,
				toPath: location.pathname,
				navigationType,
				toIsParentOfFrom,
			}),
		// Resolved once per location, so a late store update cannot flip the
		// direction halfway through the animation.
		[location.key],
	);
	const [finishedKey, setFinishedKey] = useState<string | null>(null);

	useEffect(() => {
		lastPathname = location.pathname;
	}, [location.key, location.pathname]);

	useEffect(() => {
		if (direction === 'none') return;
		const timer = window.setTimeout(() => setFinishedKey(location.key), LEVEL_TRANSITION_MS);

		return () => window.clearTimeout(timer);
	}, [direction, location.key]);

	const running = direction !== 'none' && finishedKey !== location.key;

	return {
		direction,
		className: running ? levelTransitionClass(direction, dir === 'rtl' ? 'rtl' : 'ltr') : '',
		fromPath,
	};
}

/** For tab-level and other non-statement screens. */
export function useLevelTransition(): LevelTransitionResult {
	return useLevelTransitionFor();
}

/**
 * Statement screens. Same return shape as before, so StatementContent keeps
 * composing `page ${slideInOrOut}`.
 */
const useSlideAndSubStatement = (parentId: string | undefined, statementId: string | undefined) => {
	const location = useLocation();
	const previousStatement = useAppSelector(
		statementSelector(statementIdFromPath(originFor(location.key))),
	);
	const { direction, className, fromPath } = useLevelTransitionFor(
		!!statementId && previousStatement?.parentId === statementId,
	);

	const isToStage = location.pathname.includes('/stage/');
	const isFromStage = !!fromPath?.includes('/stage/');
	const stageZoom =
		!!statementId && direction !== 'none' && isToStage !== isFromStage
			? isToStage
				? 'zoom-in'
				: 'zoom-out'
			: '';

	return {
		toSlide: !!className,
		toSubStatement:
			direction === 'push' && !!parentId && parentId === statementIdFromPath(fromPath),
		slideInOrOut: stageZoom && className ? stageZoom : className,
	};
};

export default useSlideAndSubStatement;
