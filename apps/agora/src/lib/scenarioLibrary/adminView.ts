import {
	tagLabelIn,
	AgoraLibraryReport,
	AgoraLibraryTag,
	AgoraLibraryTagKind,
	AgoraReportTargetKind,
	findNearDuplicateTags,
} from '@freedi/shared-types';

/**
 * What the admin page shows, computed in the browser from the rows the rules
 * let a sys-admin read: reports grouped by the thing reported, and pairs of
 * tags that look like the same idea.
 */

export interface ReportGroup {
	targetKind: AgoraReportTargetKind;
	targetId: string;
	scenarioId: string;
	reports: AgoraLibraryReport[];
	/** Distinct non-empty reasons, newest first */
	reasons: string[];
	/** Distinct first names of the reporters */
	reporters: string[];
	latest: number;
}

/** Open reports grouped by target; most-reported first, then newest */
export function groupReports(reports: readonly AgoraLibraryReport[]): ReportGroup[] {
	const groups = new Map<string, ReportGroup>();
	for (const report of reports) {
		if (report.status !== 'open') continue;
		const key = `${report.targetKind}:${report.targetId}`;
		const group = groups.get(key) ?? {
			targetKind: report.targetKind,
			targetId: report.targetId,
			scenarioId: report.scenarioId,
			reports: [],
			reasons: [],
			reporters: [],
			latest: 0,
		};
		group.reports.push(report);
		group.latest = Math.max(group.latest, report.createdAt);
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		const newestFirst = [...group.reports].sort((a, b) => b.createdAt - a.createdAt);
		group.reasons = [...new Set(newestFirst.map((entry) => entry.reason.trim()).filter(Boolean))];
		group.reporters = [...new Set(newestFirst.map((entry) => entry.reporterName).filter(Boolean))];
	}

	return [...groups.values()].sort(
		(a, b) => b.reports.length - a.reports.length || b.latest - a.latest,
	);
}

export interface MergeCandidate {
	from: AgoraLibraryTag;
	into: AgoraLibraryTag;
}

/**
 * Pairs of live tags of one kind whose words look the same (same key,
 * prefix, contains, or a spelling away). The less used tag is offered as the
 * duplicate; ties keep the older one. Capped, strongest matches first.
 */
export function mergeCandidates(tags: readonly AgoraLibraryTag[], limit: number): MergeCandidate[] {
	const live = tags.filter((tag) => !tag.aliasOf);
	const order = { same: 0, prefix: 1, contains: 2, close: 3 } as const;
	const found: Array<MergeCandidate & { rank: number }> = [];
	const seen = new Set<string>();
	for (const tag of live) {
		const others = live.filter((other) => other.tagId !== tag.tagId && other.kind === tag.kind);
		for (const { tag: other, reason } of findNearDuplicateTags(tag.label, tag.kind, others)) {
			const pair = [tag.tagId, other.tagId].sort().join('|');
			if (seen.has(pair)) continue;
			seen.add(pair);
			const [into, from] =
				tag.scenarioCount > other.scenarioCount ||
				(tag.scenarioCount === other.scenarioCount && tag.createdAt <= other.createdAt)
					? [tag, other]
					: [other, tag];
			found.push({ from, into, rank: order[reason] });
		}
	}

	return found
		.sort((a, b) => a.rank - b.rank)
		.slice(0, limit)
		.map(({ from, into }) => ({ from, into }));
}

/** The tags of one kind that can still be merged (not already an alias), by label */
export function liveTagsOf(
	tags: readonly AgoraLibraryTag[],
	kind: AgoraLibraryTagKind,
	lang: string,
): AgoraLibraryTag[] {
	return tags
		.filter((tag) => tag.kind === kind && !tag.aliasOf)
		.sort((a, b) => (a.labels[lang] ?? a.label).localeCompare(b.labels[lang] ?? b.label, lang));
}

/**
 * A tag as an admin reads it when judging duplicates: the viewer-language
 * label and, when the author's own words differ, those too (two tags that
 * translate to the same English word are still told apart).
 */
export function tagDisplay(tag: AgoraLibraryTag, lang: string): string {
	const shown = tagLabelIn(tag, lang);

	return shown === tag.label ? shown : `${shown} \u00B7 ${tag.label}`;
}
