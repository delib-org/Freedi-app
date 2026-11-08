export type PaletteSlot =
	| 'sky' | 'horizon' | 'haze' | 'fog' | 'hemiSky' | 'hemiGround'
	| 'ground' | 'earth' | 'grass' | 'leaves'
	| 'plaster' | 'roof' | 'stone' | 'wood' | 'trim';
export type Palette = Record<PaletteSlot, string>;
export declare const PALETTES: Record<'default' | 'sunset' | 'mediterranean' | 'forest' | 'desert', Palette>;
export declare function paletteFor(id: string): Palette;
