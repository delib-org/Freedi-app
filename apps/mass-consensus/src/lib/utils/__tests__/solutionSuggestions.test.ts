import {
	appendSolutionLines,
	cleanSuggestedSolutions,
	SUGGESTED_SOLUTIONS_COUNT,
	SUGGESTED_SOLUTION_MAX_CHARS,
} from '../solutionSuggestions';

describe('solutionSuggestions', () => {
	describe('cleanSuggestedSolutions', () => {
		it('keeps well-formed solutions in order', () => {
			const result = cleanSuggestedSolutions(['Plant more trees', 'Widen the pavements']);

			expect(result).toEqual(['Plant more trees', 'Widen the pavements']);
		});

		it('strips numbering and bullet decoration', () => {
			const result = cleanSuggestedSolutions([
				'1. Plant more trees',
				'2) Widen the pavements',
				'- Add bike lanes',
				'• Slow the traffic',
			]);

			expect(result).toEqual([
				'Plant more trees',
				'Widen the pavements',
				'Add bike lanes',
				'Slow the traffic',
			]);
		});

		it('collapses whitespace and trims', () => {
			expect(cleanSuggestedSolutions(['  Plant   more \n trees  '])).toEqual(['Plant more trees']);
		});

		it('drops duplicates ignoring case and punctuation', () => {
			const result = cleanSuggestedSolutions([
				'Plant more trees',
				'plant more trees.',
				'PLANT MORE TREES!',
				'Add bike lanes',
			]);

			expect(result).toEqual(['Plant more trees', 'Add bike lanes']);
		});

		it('drops solutions the admin already typed', () => {
			const result = cleanSuggestedSolutions(
				['Plant more trees', 'Add bike lanes'],
				SUGGESTED_SOLUTIONS_COUNT,
				['plant more trees']
			);

			expect(result).toEqual(['Add bike lanes']);
		});

		it('ignores blank, too-short and non-string entries', () => {
			const result = cleanSuggestedSolutions(['', '   ', 'ok', 42, null, 'Add bike lanes']);

			expect(result).toEqual(['Add bike lanes']);
		});

		it('caps the number of solutions', () => {
			const many = Array.from({ length: 20 }, (_, i) => `Solution number ${i}`);

			expect(cleanSuggestedSolutions(many, 6)).toHaveLength(6);
		});

		it('caps the length of a single solution', () => {
			const result = cleanSuggestedSolutions(['a'.repeat(SUGGESTED_SOLUTION_MAX_CHARS + 50)]);

			expect(result[0]).toHaveLength(SUGGESTED_SOLUTION_MAX_CHARS);
		});

		it('returns an empty list for missing input', () => {
			expect(cleanSuggestedSolutions(undefined)).toEqual([]);
		});
	});

	describe('appendSolutionLines', () => {
		it('appends to existing lines', () => {
			expect(appendSolutionLines('Plant more trees', ['Add bike lanes'])).toBe(
				'Plant more trees\nAdd bike lanes'
			);
		});

		it('drops blank lines left behind by the admin', () => {
			expect(appendSolutionLines('Plant more trees\n\n  \n', ['Add bike lanes'])).toBe(
				'Plant more trees\nAdd bike lanes'
			);
		});

		it('fills an empty textarea', () => {
			expect(appendSolutionLines('', ['Add bike lanes'])).toBe('Add bike lanes');
		});

		it('leaves the text untouched when there is nothing to add', () => {
			expect(appendSolutionLines('Plant more trees\n', [])).toBe('Plant more trees\n');
		});
	});
});
