/** Where Studio's "My Agora classrooms" lives, or '' when no Studio origin is configured */
export function studioAgoraUrl(origin: string | undefined): string {
	const base = origin?.trim().replace(/\/+$/, '');

	return base ? `${base}/agora` : '';
}

/** The configured Studio's overview. Absent origin = no link rather than a broken one. */
export function studioOverviewUrl(): string {
	return studioAgoraUrl(import.meta.env.VITE_STUDIO_ORIGIN);
}
