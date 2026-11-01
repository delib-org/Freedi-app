import {
	AGORA_STATION_LINK,
	AgoraStage,
	STATION_LINK_ERRORS,
	type AgoraStagePlanItem,
	type StationLinkError,
} from '@freedi/shared-types';

/**
 * The pure half of linked stations in Agora
 * (docs/ia/agora-linked-app-stations.md): which error a check returned,
 * whether a prefetched code is still worth opening, what the return URL
 * asked for, and whether a message from the other app is the way back.
 * The browser glue (window.open, the listener) lives in `lib/stationHandoff`.
 */

/** The editor's sentence for a failed link check; offline when the server never answered */
export function linkErrorKey(error: unknown): string {
	const failure = error as { code?: unknown; details?: unknown } | null;
	const reason = (failure?.details as { reason?: unknown } | null | undefined)?.reason;
	if (typeof reason === 'string' && STATION_LINK_ERRORS.includes(reason as StationLinkError)) {
		return `linked.err_${reason}`;
	}

	return 'linked.err_offline';
}

/** A prefetched link is opened only while it has more than a beat to live */
export const HANDOFF_SAFETY_MS = 20 * 1000;

export function isHandoffFresh(expiresAt: number | undefined, now: number): boolean {
	return expiresAt !== undefined && expiresAt - now > HANDOFF_SAFETY_MS;
}

/** When the station should fetch a new code: half way through the old one's life */
export function handoffRefreshAt(expiresAt: number): number {
	return expiresAt - AGORA_STATION_LINK.HANDOFF_TTL_MS / 2;
}

/** What `?at=booth:<itemId>&back=1` on the play route asks for */
export function stationReturnOf(
	params: { at?: unknown; back?: unknown },
	plan: readonly AgoraStagePlanItem[],
): string | null {
	if (params.back !== '1' && params.back !== 1 && params.back !== true) return null;
	if (typeof params.at !== 'string' || !params.at.startsWith('booth:')) return null;
	const itemId = params.at.slice('booth:'.length);
	const item = plan.find((candidate) => candidate.itemId === itemId);

	return item && item.stage === AgoraStage.linked ? itemId : null;
}

/** `{type:'agora-station-return', itemId}` from an allowed origin, naming one of this plan's linked steps */
export function stationReturnMessage(
	event: { origin: string; data: unknown },
	allowedOrigins: readonly string[],
	plan: readonly AgoraStagePlanItem[],
): string | null {
	if (!allowedOrigins.includes(event.origin)) return null;
	const data = event.data;
	if (!data || typeof data !== 'object' || !('type' in data) || !('itemId' in data)) return null;
	if (data.type !== AGORA_STATION_LINK.RETURN_MESSAGE || typeof data.itemId !== 'string')
		return null;
	const itemId = data.itemId;

	return plan.some((item) => item.itemId === itemId && item.stage === AgoraStage.linked)
		? itemId
		: null;
}

/** The one-line status under the link field */
export type LinkCheckState =
	| { kind: 'idle' }
	| { kind: 'checking' }
	| { kind: 'linked'; title: string }
	| { kind: 'error'; key: string };

export function linkCheckIdle(item: AgoraStagePlanItem): LinkCheckState {
	return item.link ? { kind: 'linked', title: item.link.title } : { kind: 'idle' };
}
