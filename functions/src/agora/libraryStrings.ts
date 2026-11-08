import type { AgoraScenarioCardText, AgoraTopicPackage } from '@freedi/shared-types';

/**
 * Which strings of a scenario are words to be translated.
 *
 * Translation is done on a flat list: the package is walked once into "slots"
 * (a way to read and a way to write one string), the readable strings go to the
 * model as an array, and the answers go back into the same slots. The model is
 * never asked to return a package, so ids, scene kinds, weights, URLs and every
 * other field the game depends on cannot be damaged by a translation.
 */

interface Slot {
	get: () => string;
	set: (value: string) => void;
}

/** Slots over `pkg`, in a fixed order — {@link collectPackageStrings} and {@link applyPackageStrings} must agree on it */
function slotsOf(pkg: AgoraTopicPackage): Slot[] {
	const slots: Slot[] = [];
	const add = <T extends object, K extends keyof T>(holder: T, key: K): void => {
		if (typeof holder[key] !== 'string') return;
		slots.push({
			get: () => holder[key] as unknown as string,
			set: (value: string) => {
				(holder as Record<K, string>)[key] = value;
			},
		});
	};
	const addList = (list: string[] | undefined): void => {
		if (!list) return;
		list.forEach((_, index) => {
			slots.push({
				get: () => list[index],
				set: (value: string) => {
					list[index] = value;
				},
			});
		});
	};

	add(pkg, 'title');
	add(pkg, 'topic');
	add(pkg, 'framingText');
	add(pkg, 'challengeQuestion');
	for (const character of pkg.characters) {
		add(character, 'name');
		add(character, 'role');
		addList(character.arguments);
		addList(character.needs);
		for (const value of character.values) {
			add(value, 'label');
			add(value, 'description');
		}
	}
	add(pkg.positioningScale, 'leftLabel');
	add(pkg.positioningScale, 'rightLabel');
	for (const criterion of pkg.plausibilityRubric.criteria) {
		add(criterion, 'label');
		add(criterion, 'description');
	}
	for (const metric of pkg.healthMetrics) {
		add(metric, 'label');
		add(metric, 'description');
	}
	for (const scene of pkg.scenes) {
		add(scene, 'title');
		add(scene, 'text');
		for (const line of scene.dialogue) {
			add(line, 'speaker');
			add(line, 'line');
		}
	}

	return slots;
}

/** Every translatable string of the package, in slot order (blanks included, so positions line up) */
export function collectPackageStrings(pkg: AgoraTopicPackage): string[] {
	return slotsOf(pkg).map((slot) => slot.get());
}

/**
 * A copy of `pkg` with the translated strings written back, in the order
 * {@link collectPackageStrings} produced them. The answer key is rebuilt from
 * the translated characters, so a grading key never disagrees with the values
 * the students see.
 */
export function applyPackageStrings(
	pkg: AgoraTopicPackage,
	strings: readonly string[],
): AgoraTopicPackage {
	const copy = JSON.parse(JSON.stringify(pkg)) as AgoraTopicPackage;
	const slots = slotsOf(copy);
	if (slots.length !== strings.length) {
		throw new Error(`Expected ${slots.length} translated strings, got ${strings.length}`);
	}
	slots.forEach((slot, index) => slot.set(strings[index]));

	const valuesByCharacter = new Map(
		copy.characters.map((character) => [character.characterId, character.values]),
	);
	copy.valueAnswerKey = copy.valueAnswerKey.map((key) => {
		const values = valuesByCharacter.get(key.characterId);
		if (!values) return key;

		return {
			...key,
			expectedValues: key.expectedValues.map(
				(expected) => values.find((value) => value.valueId === expected.valueId) ?? expected,
			),
		};
	});

	return copy;
}

/** The few strings a library card and the page's lesson preview show */
export function cardStringsOf(pkg: AgoraTopicPackage, summary: string): string[] {
	return [
		pkg.title,
		summary,
		pkg.challengeQuestion,
		...pkg.characters.map((character) => `${character.name} — ${character.role}`),
		...pkg.scenes.map((scene) => scene.title),
	];
}

/** The inverse of {@link cardStringsOf} */
export function cardTextFrom(
	pkg: AgoraTopicPackage,
	strings: readonly string[],
): AgoraScenarioCardText {
	const characterCount = pkg.characters.length;

	return {
		title: strings[0] ?? pkg.title,
		summary: strings[1] ?? '',
		challengeQuestion: strings[2] ?? pkg.challengeQuestion,
		characters: strings.slice(3, 3 + characterCount),
		scenes: strings.slice(3 + characterCount),
	};
}

/** "Dana Cohen" -> "Dana"; an e-mail or nothing -> "" (the client words the anonymous case) */
export function firstNameOf(displayName: unknown): string {
	if (typeof displayName !== 'string') return '';
	const trimmed = displayName.trim();
	if (!trimmed || trimmed.includes('@')) return '';

	return trimmed.split(/\s+/)[0].slice(0, 40);
}

/** The library-wide mean rating from its running total, shrunk toward the default while the library is young */
export function libraryGlobalMean(
	total: number,
	count: number,
	fallback: number,
	weight: number,
): number {
	return (total + weight * fallback) / (count + weight);
}
