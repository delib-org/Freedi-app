/** Where Studio's "My Agora classrooms" lives, or '' when no Studio origin is configured */
export function studioAgoraUrl(origin: string | undefined): string {
	const base = origin?.trim().replace(/\/+$/, '');

	return base ? `${base}/agora` : '';
}

/** Studio's overview: VITE_STUDIO_ORIGIN, else the live Studio domain */
export function studioOverviewUrl(): string {
	return studioAgoraUrl(import.meta.env.VITE_STUDIO_ORIGIN || 'https://studio.wizcol.com');
}
