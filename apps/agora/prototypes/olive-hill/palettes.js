/**
 * The village's colour sets, chosen per device in the app's gear sheet and
 * posted to the world with the rest of the state (`palette` on
 * 'agora-village-state').
 *
 * `default` is the hill as it was drawn; every other set is read as a
 * RATIO to it, so a material keeps its own shade (the cottage's stone is a
 * touch greyer than the booths') and only the family it belongs to moves.
 * Sky, haze and light are set outright.
 *
 * The booths' roofs are left alone: their colour tells a story booth from a
 * needs booth, whatever the village wears.
 *
 * The ids are mirrored by `VILLAGE_PALETTES` in src/lib/villagePrefs.ts; a
 * unit test keeps the two lists equal.
 */
export const PALETTES = {
	default: {
		sky: '#76acc9', horizon: '#f4dfb5', haze: '#b9d1d2', fog: '#b6cac3', hemiSky: '#d7eef3', hemiGround: '#797048',
		ground: '#8d9962', earth: '#c1b286', grass: '#829557', leaves: '#9daa7d',
		plaster: '#e5d7b6', roof: '#ae6748', stone: '#d8c7a5', wood: '#70543b', trim: '#456760',
	},
	sunset: {
		sky: '#8a86b8', horizon: '#f6b27a', haze: '#e3bfa6', fog: '#d9b9a2', hemiSky: '#f3d6c2', hemiGround: '#7a5f40',
		ground: '#9a9a58', earth: '#c9a479', grass: '#8f9650', leaves: '#a9a777',
		plaster: '#f0d2b0', roof: '#b8553a', stone: '#e0c3a0', wood: '#7a4d33', trim: '#7a5a45',
	},
	mediterranean: {
		sky: '#3f8fd0', horizon: '#dff1f7', haze: '#b5dbe8', fog: '#bfdde6', hemiSky: '#e2f4fb', hemiGround: '#7d7550',
		ground: '#8a9a5e', earth: '#d8c9a4', grass: '#7f9a55', leaves: '#9fae86',
		plaster: '#f6f1e6', roof: '#c4643f', stone: '#ece2cc', wood: '#6d5844', trim: '#2f6fa8',
	},
	forest: {
		sky: '#6f9fb2', horizon: '#e4e2c8', haze: '#b4c6b4', fog: '#9fb8a2', hemiSky: '#cfe6d6', hemiGround: '#4f5a34',
		ground: '#5f7d45', earth: '#9c8a62', grass: '#5d8a44', leaves: '#6f9a5e',
		plaster: '#d9ceb0', roof: '#7d4a35', stone: '#b8b096', wood: '#5a4230', trim: '#3f5a3a',
	},
	desert: {
		sky: '#8fb6d0', horizon: '#f7e2b8', haze: '#e8d6b4', fog: '#e3cfaa', hemiSky: '#f6ead2', hemiGround: '#9a7c4c',
		ground: '#b9a46c', earth: '#d8bd88', grass: '#a39a5c', leaves: '#a4a87e',
		plaster: '#ecd7ae', roof: '#b9774a', stone: '#e2cc9e', wood: '#7c5a3a', trim: '#8a6a48',
	},
};

/** The set to wear for an id from the app, falling back to the hill as drawn. */
export function paletteFor(id) {
	return Object.prototype.hasOwnProperty.call(PALETTES, id) ? PALETTES[id] : PALETTES.default;
}
