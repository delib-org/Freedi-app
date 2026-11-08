import {
	LIBRARY_REPORT_EMAIL,
	LibraryReportEmailInput,
	buildLibraryReportEmail,
	escapeHtml,
	libraryQueueUrl,
	resolveReportRecipients,
} from '../libraryReportEmail';

const QUEUE = 'https://agora.example/#!/teach/library/admin';

function input(overrides: Partial<LibraryReportEmailInput> = {}): LibraryReportEmailInput {
	return {
		report: {
			reportId: 'scenario__s1__t1',
			targetKind: 'scenario',
			reason: 'Offensive cover',
			createdAt: Date.UTC(2026, 9, 15, 9, 0),
		},
		scenarioTitle: 'The French Revolution',
		reporterRole: 'school',
		queueUrl: QUEUE,
		...overrides,
	};
}

describe('libraryReportEmail', () => {
	describe('buildLibraryReportEmail', () => {
		it('names what was reported, why, by whom (role only) and links the queue', () => {
			const letter = buildLibraryReportEmail(input({ openCount: 3 }));

			expect(letter.subject).toContain('[Agora library]');
			expect(letter.subject).toContain('The French Revolution');
			for (const body of [letter.text, letter.html]) {
				expect(body).toContain('The French Revolution');
				expect(body).toContain('Offensive cover');
				expect(body).toContain('מורה');
				expect(body).toContain(QUEUE);
				expect(body).toContain('3');
			}
		});

		it('never carries the reporter id or report id', () => {
			const letter = buildLibraryReportEmail(input());

			expect(letter.text).not.toContain('t1');
			expect(letter.html).not.toContain('scenario__s1__t1');
		});

		it('quotes the reported post, clipped', () => {
			const long = 'word '.repeat(100);
			const letter = buildLibraryReportEmail(
				input({
					report: { ...input().report, targetKind: 'post' },
					targetText: long,
				}),
			);

			expect(letter.text).toContain('ההודעה');
			expect(letter.text).toContain('…');
			const quoted = letter.text.split('\n').find((line) => line.startsWith('ההודעה'));
			expect(quoted?.length).toBeLessThan(LIBRARY_REPORT_EMAIL.EXCERPT_MAX + 20);
		});

		it('escapes teacher-written text in the HTML', () => {
			const letter = buildLibraryReportEmail(
				input({
					scenarioTitle: '<script>x</script>',
					report: { ...input().report, reason: 'a & b' },
				}),
			);

			expect(letter.html).not.toContain('<script>');
			expect(letter.html).toContain('&lt;script&gt;');
			expect(letter.html).toContain('a &amp; b');
		});

		it('says so when there is no reason or the scenario is gone', () => {
			const letter = buildLibraryReportEmail(
				input({ scenarioTitle: '', report: { ...input().report, reason: '  ' } }),
			);

			expect(letter.text).toContain('(לא נכתבה סיבה)');
			expect(letter.text).toContain('(לא נמצא)');
		});

		it('labels an unverified reporter honestly', () => {
			expect(buildLibraryReportEmail(input({ reporterRole: 'unknown' })).text).toContain('לא אומת');
			expect(buildLibraryReportEmail(input({ reporterRole: 'admin' })).text).toContain(
				'מנהל/ת מערכת',
			);
		});
	});

	describe('libraryQueueUrl', () => {
		it('points at the admin route of the configured app', () => {
			expect(libraryQueueUrl('https://agora.example/')).toBe(QUEUE);
		});

		it('falls back to the live app', () => {
			expect(libraryQueueUrl(undefined)).toBe(
				`${LIBRARY_REPORT_EMAIL.DEFAULT_APP_URL}${LIBRARY_REPORT_EMAIL.QUEUE_ROUTE}`,
			);
			expect(libraryQueueUrl('  ')).toContain(LIBRARY_REPORT_EMAIL.DEFAULT_APP_URL);
		});
	});

	describe('resolveReportRecipients', () => {
		it('prefers the configured list, cleaned and deduplicated', () => {
			expect(resolveReportRecipients(' A@x.org, a@x.org ,junk', ['admin@x.org'])).toEqual([
				'a@x.org',
			]);
		});

		it('falls back to the admins’ own addresses', () => {
			expect(resolveReportRecipients('', ['Admin@x.org', undefined, 'nope'])).toEqual([
				'admin@x.org',
			]);
			expect(resolveReportRecipients(undefined, [])).toEqual([]);
		});
	});

	it('escapeHtml escapes every special character', () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
		);
	});
});
