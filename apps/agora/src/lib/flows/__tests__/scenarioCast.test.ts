import { describe, expect, it } from 'vitest';
import { AgoraStage, stagePlanPreset } from '@freedi/shared-types';
import { buildDefaultFrenchRevolutionTopic } from '../../defaultTopic';
import {
	castFigures,
	castLinesFor,
	castStandsAtBooth,
	isCastStage,
	needsQuestionOf,
	planHasCast,
	scenarioCast,
} from '../scenarioCast';

const topic = buildDefaultFrenchRevolutionTopic('teacher-1');

describe('scenarioCast', () => {
	it('stands the Count and Camille from the package, with three opinions and three needs', () => {
		const cast = scenarioCast(topic);
		expect(cast.map((member) => member.name)).toEqual(['הרוזן דה-לה-רוש', 'קמיל דופון']);
		for (const member of cast) {
			expect(member.opinions).toHaveLength(3);
			expect(member.needs).toHaveLength(3);
			expect(member.portraitUrl).toMatch(/^\/scenes\//);
		}
	});

	it('speaks only the fixed scene lines', () => {
		const [count, camille] = scenarioCast(topic);
		const scene = (id: string): string[] =>
			topic.scenes.find((s) => s.sceneId === id)?.dialogue.map((d) => d.line) ?? [];
		expect(count.meetLines).toEqual(scene('scene-royalist'));
		expect(camille.meetLines).toEqual(scene('scene-jacobin'));
		expect(count.needsLines).toEqual(scene('scene-needs-a'));
		expect(camille.needsLines).toEqual(scene('scene-needs-b'));
		expect(castLinesFor(count, AgoraStage.needs)).toBe(count.needsLines);
		expect(castLinesFor(count, AgoraStage.perspectives)).toBe(count.meetLines);
	});

	it('falls back to the opinions and needs when the scenes have no dialogue', () => {
		const bare = { ...topic, scenes: [] };
		const [count] = scenarioCast(bare);
		expect(count.meetLines).toEqual(count.opinions);
		expect(count.needsLines).toEqual(count.needs);
	});

	it('is empty for a quick package and for no topic', () => {
		expect(scenarioCast({ ...topic, kind: 'quick' })).toEqual([]);
		expect(scenarioCast(undefined)).toEqual([]);
	});

	it('hands the world only names and pictures', () => {
		expect(castFigures(scenarioCast(topic))[0]).toEqual({
			id: topic.characters[0].characterId,
			name: topic.characters[0].name,
			portraitUrl: topic.characters[0].portraitUrl,
		});
	});

	it('reads the needs question from its scene', () => {
		expect(needsQuestionOf(topic)).toContain('מה אתם בעצם צריכים');
		expect(needsQuestionOf(undefined)).toBe('');
	});
});

describe('where the cast stands', () => {
	it('stands in a lesson that meets the two sides', () => {
		expect(planHasCast(stagePlanPreset('scenarioWizcol'))).toBe(true);
		expect(planHasCast([{ itemId: 'a', stage: AgoraStage.lobby }])).toBe(false);
	});

	it('knows its stages and its booths', () => {
		expect(isCastStage(AgoraStage.perspectives)).toBe(true);
		expect(isCastStage(AgoraStage.framing)).toBe(false);
		expect(castStandsAtBooth('story')).toBe(true);
		expect(castStandsAtBooth('needs')).toBe(true);
		expect(castStandsAtBooth('open')).toBe(false);
		expect(castStandsAtBooth('proposal')).toBe(false);
	});
});
