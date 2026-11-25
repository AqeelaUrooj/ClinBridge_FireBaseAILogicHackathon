import type { ReactNode } from 'react';
import { Icon } from '../../components/ui';
import { ANDROID_RELEASE, androidDownload, REPOSITORY, type AndroidRelease } from '../../config/androidRelease';
import { InstallButton } from './InstallPractice';

const file = (path: string) => `${REPOSITORY}/blob/main/${path}`;
const folder = (path: string) => `${REPOSITORY}/tree/main/${path}`;

/** Every address is a file or folder of this repository; a test checks that each one exists. */
export const PROJECT_LINKS: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  ['Source code', [['Web and desktop source', folder('src')], ['Android source', folder('mobile')]]],
  ['Installation', [['Web and desktop installation', file('docs/JUDGE_DEMO_GUIDE.md')], ['Android installation', file('mobile/docs/INSTALL_ANDROID.md')]]],
  ['Architecture', [['Web and hybrid AI design', file('docs/AI_INTEGRATION.md')], ['Android design', file('mobile/docs/ARCHITECTURE_AND_DECISIONS.md')]]],
  ['Test reports', [['Web release report', file('docs/RELEASE_REPORT_2026-11-24.md')], ['Android tests', file('mobile/docs/TEST_REPORT_2026-11-25.md')], ['Android phone test', file('mobile/docs/PHYSICAL_ANDROID_RESULTS_2026-11-25.md')]]],
];

/** Public demo only: the three ways to use ClinBridge, and where its source and reports are. */
export function ProductAccess({ launch, release = ANDROID_RELEASE }: { launch: ReactNode; release?: AndroidRelease | null }) {
  const apk = androidDownload(release);
  return (
    <section id="access" tabIndex={-1} className="lp-wrap lp-section" aria-labelledby="access-title">
      <div className="lp-centered"><p className="lp-label">Product access</p><h2 id="access-title">Web, desktop and Android</h2><p>Three ways to try the Practice demonstration. Fictional patients only.</p></div>
      <div className="lp-access">
        <article>
          <Icon name="language" /><h3>Web application</h3>
          <p>Open the Practice demo in your browser. Nothing to install. Firebase AI features are here, when cloud use is permitted.</p>
          <dl>
            <div><dt>Made for</dt><dd>Chrome on a laptop</dd></div>
            <div><dt>Sign-in</dt><dd>Practice PIN, shown on the screen</dd></div>
          </dl>
          {launch}
          <span className="lp-access-links"><a href={file('docs/JUDGE_DEMO_GUIDE.md')}>Judge demo guide</a></span>
        </article>
        <article>
          <Icon name="install_desktop" /><h3>Desktop application</h3>
          <p>The same web application, installed by Chrome or Edge in its own window. It opens without internet once it is saved. There is no .exe file.</p>
          <dl>
            <div><dt>Made for</dt><dd>Chrome or Edge on a laptop</dd></div>
            <div><dt>Tested on</dt><dd>Windows 10, Chrome</dd></div>
          </dl>
          <InstallButton />
          <span className="lp-access-links"><a href={file('docs/JUDGE_DEMO_GUIDE.md#install-it-windows-laptop-chrome-or-edge')}>Installation guide</a></span>
        </article>
        <article>
          <img src="/icon.svg" alt="" /><h3>Android application</h3>
          <p>Native Android application for offline bedside nursing documentation with encrypted local storage.</p>
          <p className="lp-access-note">Separate Practice-only offline prototype. Firebase AI features are available in the web application, not the Android application.</p>
          <dl>
            <div><dt>Version</dt><dd>{release && apk ? release.version : '0.1.0, not published yet'}</dd></div>
            {apk && <div><dt>File</dt><dd>APK, {apk.size}</dd></div>}
            <div><dt>Made for</dt><dd>Android 8.0 or newer, ARM phones</dd></div>
            <div><dt>Tested on</dt><dd>realme 5i, Android 10</dd></div>
            {release && apk && <div><dt>SHA-256</dt><dd><code>{release.sha256}</code></dd></div>}
          </dl>
          {apk
            ? <a className="lp-button" href={apk.apk}><Icon name="android" /> Download Android APK</a>
            : <><p id="apk-state" className="lp-access-note">Not available yet. The release is being prepared.</p><button type="button" className="lp-button" disabled aria-describedby="apk-state"><Icon name="android" /> Download Android APK</button></>}
          <span className="lp-access-links"><a href={file('mobile/docs/INSTALL_ANDROID.md')}>Installation guide</a>{apk && <a href={apk.page}>Release page</a>}</span>
        </article>
      </div>
      <nav className="lp-project" aria-label="Project on GitHub">
        <div><h3>Project</h3><a href={REPOSITORY}>View Project on GitHub</a>{apk ? <a href={apk.page}>Android APK release</a> : <span>Android APK release: not published yet</span>}</div>
        {PROJECT_LINKS.map(([title, links]) => <div key={title}><h3>{title}</h3>{links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</div>)}
      </nav>
    </section>
  );
}
