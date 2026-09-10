/** Hash routes work on both Firebase Hosting and the private static village site. */
export function sessionJoinUrl(origin: string, code: string, village: boolean): string {
	return `${origin}/${village ? '?world=village' : ''}#!/join/${encodeURIComponent(code)}`;
}

export function isVillageMode(search: string): boolean {
	return new URLSearchParams(search).get('world') === 'village';
}
