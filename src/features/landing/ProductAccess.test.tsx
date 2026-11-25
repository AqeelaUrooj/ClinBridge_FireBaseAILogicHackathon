import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANDROID_RELEASE, androidDownload, REPOSITORY, type AndroidRelease } from '../../config/androidRelease';
import { ProductAccess, PROJECT_LINKS } from './ProductAccess';

/** Not a real release: only to see what the page does when there is one. */
const example: AndroidRelease = { tag: 'android-v9.9.9', version: '9.9.9', bytes: 50_000_000, sha256: 'a'.repeat(64) };
const show = (release: AndroidRelease | null) => render(<ProductAccess launch={<a href="/sign-in?demo=practice">Launch Practice Demo</a>} release={release} />);

describe('product access', () => {
  it('without a release: the button is off and no release address is on the page', () => {
    const { container } = show(null);
    expect(screen.getByRole('button', { name: /Download Android APK/ })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /Download Android APK/ })).toBeNull();
    expect(screen.getByText(/Not available yet/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/releases\/|\.apk|SHA-256/);
  });

  it('with a release: the button goes straight to its file, with size, checksum and release page', () => {
    const { container } = show(example);
    expect(screen.getByRole('link', { name: /Download Android APK/ })).toHaveAttribute('href', `${REPOSITORY}/releases/download/android-v9.9.9/clinbridge-android-practice.apk`);
    for (const l of screen.getAllByRole('link', { name: /Release page|Android APK release/ })) expect(l).toHaveAttribute('href', `${REPOSITORY}/releases/tag/android-v9.9.9`);
    expect(container).toHaveTextContent('47.7 MB');
    expect(container).toHaveTextContent(example.sha256);
    expect(container).not.toHaveTextContent(/not published|Not available/);
  });

  it.each([
    { ...example, sha256: '' }, { ...example, sha256: 'A'.repeat(64) }, { ...example, tag: 'latest' }, { ...example, bytes: 0 }, { ...example, bytes: NaN }, { ...example, version: '' },
  ])('an incomplete release counts as none: %j', (r) => {
    expect(androidDownload(r)).toBeNull();
    show(r);
    expect(screen.getByRole('button', { name: /Download Android APK/ })).toBeDisabled();
  });

  it('says what the Android app is and is not, in both states', () => {
    for (const r of [null, example]) {
      const { container, unmount } = show(r);
      expect(container).toHaveTextContent('Native Android application for offline bedside nursing documentation with encrypted local storage.');
      expect(container).toHaveTextContent('Separate Practice-only offline prototype. Firebase AI features are available in the web application, not the Android application.');
      unmount();
    }
  });

  it('every project link is a file or folder of this repository', () => {
    show(null);
    const hrefs = [...PROJECT_LINKS.flatMap(([, l]) => l.map(([, h]) => h)), ...screen.getAllByRole('link').map((a) => a.getAttribute('href')!)].filter((h) => h.startsWith(REPOSITORY + '/'));
    expect(hrefs.length).toBeGreaterThan(8);
    for (const h of hrefs) {
      const [, path] = /\/(?:blob|tree)\/main\/([^#]+)/.exec(h) ?? [];
      expect(path && existsSync(path), h).toBe(true);
    }
  });

  it('the published values are the documented ones', () => {
    expect(readFileSync('mobile/pubspec.yaml', 'utf8')).toMatch(/^version: 0\.1\.0\+1\r?$/m); // the version shown before a release
    if (!ANDROID_RELEASE) return;
    const { version, sha256, bytes } = ANDROID_RELEASE as AndroidRelease;
    const notes = readFileSync(`mobile/docs/RELEASE_NOTES_${version}.md`, 'utf8');
    expect(notes).toContain(sha256);
    expect(notes).toContain(bytes.toLocaleString('en-US'));
  });
});
