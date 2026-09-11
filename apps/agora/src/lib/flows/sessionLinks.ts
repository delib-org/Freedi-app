/** Hash routes work on both Firebase Hosting and the private static village site. */
export function sessionJoinUrl(origin: string, code: string, village: boolean): string {
	return `${origin}/${village ? '?world=village' : ''}#!/join/${encodeURIComponent(code)}`;
}

export function isVillageMode(search: string): boolean {
	return new URLSearchParams(search).get('world') === 'village';
}

/** The saved room choice must also reach students who joined using only a code. */
export function sessionVillageMode(
	world: 'village' | 'classic' | undefined,
	search: string,
	override?: boolean,
): boolean {
	return override ?? (world ? world === 'village' : isVillageMode(search));
}
