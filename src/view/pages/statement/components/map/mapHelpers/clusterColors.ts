/**
 * Cluster colours for the sticky-note board and the mind-elixir branches.
 *
 * Each cluster gets one palette entry: a strong `line` for its frame border,
 * header and connector; a pale `card` tint for its sticky notes; a `frame`
 * wash lighter than the notes so they still stand out inside the frame; and a
 * readable `text` colour on the tint. Concrete hex (not CSS vars) because
 * mind-elixir paints `branchColor` onto SVG strokes via JS, which doesn't
 * resolve vars.
 */
export interface ClusterPaletteEntry {
	/** Strong color for connector lines, the frame border and the cluster pill. */
	line: string;
	/** Light tint for member sticky-note cards. */
	card: string;
	/** Readable text color on the card tint. */
	text: string;
}

/** A palette entry plus the frame wash derived from it. */
export interface ClusterColor extends ClusterPaletteEntry {
	/** Opaque, lighter-than-card wash behind a cluster's notes. */
	frame: string;
}

export const CLUSTER_PALETTE: ClusterPaletteEntry[] = [
	{ line: '#f2c12e', card: '#fdeca8', text: '#5b4a00' }, // yellow
	{ line: '#8b6fd6', card: '#d9ccf3', text: '#2e1d56' }, // purple
	{ line: '#4a9fe0', card: '#c2e0f7', text: '#0f3350' }, // blue
	{ line: '#5fbb46', card: '#cdeec0', text: '#1f3d10' }, // green
	{ line: '#ee8a37', card: '#fbd9b5', text: '#5a2f06' }, // orange
	{ line: '#e76fa6', card: '#f8cfe0', text: '#5a1336' }, // pink
	{ line: '#34bdb4', card: '#bdeeea', text: '#0c3b38' }, // teal
	{ line: '#e2554d', card: '#fae0df', text: '#5a221f' }, // red
	{ line: '#5b6cd6', card: '#e2e5f8', text: '#242b56' }, // indigo
	{ line: '#8cbf3f', card: '#eaf3dc', text: '#384c19' }, // lime
	{ line: '#2bb6c4', card: '#d9f2f4', text: '#11494e' }, // cyan
	{ line: '#c455b8', card: '#f4e0f2', text: '#4e224a' }, // magenta
	{ line: '#d99a2b', card: '#f8edd9', text: '#573e11' }, // amber
	{ line: '#6b7a99', card: '#e4e7ed', text: '#2b313d' }, // slate
	{ line: '#e06b8a', card: '#f9e4ea', text: '#5a2b37' }, // rose
	{ line: '#4ab0e0', card: '#def1f9', text: '#1e465a' }, // sky
];

/** Colour for the synthetic "Ungrouped" block — deliberately outside the palette. */
export const UNGROUPED_PALETTE: ClusterPaletteEntry = {
	line: '#9aa3b2',
	card: '#e7eaf0',
	text: '#3d4d71',
};

// How far the card tint is pushed toward white to get the frame wash. The
// frame must stay opaque (it hides the hub connector running under it) and
// lighter than the notes so they read as objects sitting on it.
const FRAME_LIGHTEN = 0.55;
// A custom colour's card tint / text darkness, matching the preset palette.
const CARD_LIGHTEN = 0.82;
const TEXT_DARKEN = 0.4;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const value = parseInt(match[1], 16);

	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex(r: number, g: number, b: number): string {
	return (
		'#' +
		[r, g, b]
			.map((v) =>
				Math.max(0, Math.min(255, Math.round(v)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

/** Move a hex colour `amount` (0..1) of the way toward white. */
export function lightenHex(hex: string, amount: number): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;
	const { r, g, b } = rgb;

	return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Build a full palette entry (line, light card tint, readable text) from one chosen colour. */
export function deriveClusterPalette(hex: string): ClusterPaletteEntry {
	const rgb = hexToRgb(hex);
	if (!rgb) return UNGROUPED_PALETTE;
	const { r, g, b } = rgb;

	return {
		line: hex,
		card: lightenHex(hex, CARD_LIGHTEN),
		text: toHex(r * TEXT_DARKEN, g * TEXT_DARKEN, b * TEXT_DARKEN),
	};
}

/** Add the frame wash to a palette entry. */
export function withFrame(entry: ClusterPaletteEntry): ClusterColor {
	return { ...entry, frame: lightenHex(entry.card, FRAME_LIGHTEN) };
}

/**
 * Preferred palette slot for a cluster, hashed from its id. Using the id (not
 * the cluster's position) keeps a cluster's colour fixed as notes/clusters are
 * added, removed, or re-sorted.
 */
export function paletteIndexForId(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}

	return Math.abs(hash) % CLUSTER_PALETTE.length;
}

/** The palette entry a saved colour maps to: a preset if it is one, else derived. */
function resolveSavedColor(hex: string): ClusterPaletteEntry {
	const preset = CLUSTER_PALETTE.find((entry) => entry.line.toLowerCase() === hex.toLowerCase());

	return preset ?? deriveClusterPalette(hex);
}

export interface ClusterColorInput {
	id: string;
	/** The cluster's saved colour, if an admin picked one. */
	color?: string | null;
}

/**
 * Colour every cluster on a board so that no two share a palette slot while
 * there are slots to spare.
 *
 * Saved colours always win and reserve their preset slot. Each remaining
 * cluster takes its hashed slot when free, else the next free one — so a
 * cluster keeps its colour across renders unless a collision forces the
 * later cluster (in board order) to step aside. Past 16 clusters the palette
 * wraps and duplicates become unavoidable.
 */
export function assignClusterColors(clusters: ClusterColorInput[]): Map<string, ClusterColor> {
	const out = new Map<string, ClusterColor>();
	const taken = new Set<number>();
	const size = CLUSTER_PALETTE.length;

	for (const cluster of clusters) {
		if (!cluster.color) continue;
		const entry = resolveSavedColor(cluster.color);
		out.set(cluster.id, withFrame(entry));
		const index = CLUSTER_PALETTE.indexOf(entry);
		if (index >= 0) taken.add(index);
	}

	for (const cluster of clusters) {
		if (cluster.color) continue;
		let index = paletteIndexForId(cluster.id);
		if (taken.size < size) {
			while (taken.has(index)) index = (index + 1) % size;
		}
		taken.add(index);
		out.set(cluster.id, withFrame(CLUSTER_PALETTE[index]));
	}

	return out;
}
