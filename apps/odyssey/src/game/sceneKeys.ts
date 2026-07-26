import type { SceneKey } from '../lib/stageBus';

/** Bus scene keys → Phaser scene registry keys. */
export const SCENE_KEY_MAP: Record<SceneKey, string> = {
	harbor: 'HarborScene',
	compass: 'CompassScene',
	chart: 'ChartScene',
	voyage: 'VoyageScene',
	homecoming: 'HomecomingScene',
};
