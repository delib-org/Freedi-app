import {
	DEFAULT_SYNTHESIS_SETTINGS,
	MC_DEFAULT_SYNTHESIS_SETTINGS,
	validateSynthesisSettings,
} from '../pipeline/types';
import { loadSynthesisSettingsFromStatement } from '../pipeline/loadSynthesisSettings';

type AnyStatement = Record<string, unknown>;

describe('synthesis settings', () => {
	describe('validateSynthesisSettings', () => {
		it('accepts the default block', () => {
			const result = validateSynthesisSettings(DEFAULT_SYNTHESIS_SETTINGS);
			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it('rejects minEvaluators below 1', () => {
			const result = validateSynthesisSettings({ minEvaluators: 0 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('minEvaluators must be a finite integer ≥ 1');
		});

		it('rejects out-of-range consensus', () => {
			const result = validateSynthesisSettings({ minConsensus: 1.5 });
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toMatch(/minConsensus/);
		});

		it('rejects reviewLowerBound >= attachThreshold', () => {
			const result = validateSynthesisSettings({
				reviewLowerBound: 0.95,
				attachThreshold: 0.9,
			});
			expect(result.valid).toBe(false);
			expect(result.errors.join(' ')).toMatch(/strictly less/);
		});

		it('reports multiple errors at once', () => {
			const result = validateSynthesisSettings({
				minEvaluators: -1,
				minConsensus: 2,
				attachThreshold: 5,
				reviewLowerBound: 0.4,
			});
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThanOrEqual(3);
		});
	});

	describe('loadSynthesisSettingsFromStatement', () => {
		it('returns disabled default for an empty statement', () => {
			const stmt = {} as AnyStatement;
			expect(loadSynthesisSettingsFromStatement(stmt as never)).toEqual(DEFAULT_SYNTHESIS_SETTINGS);
		});

		it('returns MC default (enabled: true) for a mass-consensus question', () => {
			const stmt = {
				questionSettings: { questionType: 'mass-consensus' },
			} as AnyStatement;
			const result = loadSynthesisSettingsFromStatement(stmt as never);
			expect(result).toEqual(MC_DEFAULT_SYNTHESIS_SETTINGS);
		});

		it('honors explicit synthesis block', () => {
			const stmt = {
				statementSettings: {
					synthesis: {
						enabled: true,
						minEvaluators: 5,
						minConsensus: 0.3,
						attachThreshold: 0.97,
						reviewLowerBound: 0.88,
					},
				},
			} as AnyStatement;
			const result = loadSynthesisSettingsFromStatement(stmt as never);
			expect(result).toEqual({
				enabled: true,
				minEvaluators: 5,
				minConsensus: 0.3,
				attachThreshold: 0.97,
				reviewLowerBound: 0.88,
			});
		});

		it('legacy liveSynthEnabled=true overrides default for non-MC questions', () => {
			const stmt = {
				statementSettings: { liveSynthEnabled: true },
			} as AnyStatement;
			const result = loadSynthesisSettingsFromStatement(stmt as never);
			expect(result.enabled).toBe(true);
			expect(result.minEvaluators).toBe(DEFAULT_SYNTHESIS_SETTINGS.minEvaluators);
		});

		it('partial synthesis block falls through to defaults for missing keys', () => {
			const stmt = {
				statementSettings: {
					synthesis: { enabled: true, attachThreshold: 0.92 },
				},
			} as AnyStatement;
			const result = loadSynthesisSettingsFromStatement(stmt as never);
			expect(result.enabled).toBe(true);
			expect(result.attachThreshold).toBe(0.92);
			expect(result.minEvaluators).toBe(DEFAULT_SYNTHESIS_SETTINGS.minEvaluators);
			expect(result.reviewLowerBound).toBe(DEFAULT_SYNTHESIS_SETTINGS.reviewLowerBound);
		});

		it('explicit synthesis block beats legacy liveSynthEnabled', () => {
			const stmt = {
				statementSettings: {
					synthesis: { enabled: false },
					liveSynthEnabled: true,
				},
			} as AnyStatement;
			const result = loadSynthesisSettingsFromStatement(stmt as never);
			expect(result.enabled).toBe(false);
		});
	});
});
