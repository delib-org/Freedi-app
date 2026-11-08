import { safeRedirectPath } from '../safeRedirect';

describe('safeRedirectPath', () => {
  it('keeps a same-origin relative path', () => {
    expect(safeRedirectPath('/admin/surveys?x=1#top', '/')).toBe('/admin/surveys?x=1#top');
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['backslash in the middle', '/a\\b'],
    ['full url', 'https://evil.example'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['tab before host', '/\t/evil.example'],
    ['newline before host', '/\n/evil.example'],
  ])('falls back for %s', (_name, target) => {
    expect(safeRedirectPath(target, '/home')).toBe('/home');
  });
});
