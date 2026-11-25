import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/ui';
import { askToInstall, browserKind, INSTALL_STEPS, useInstallState, type InstallState } from '../../lib/install';
import { useOfflineReady } from '../../lib/offlineCopy';

const RESULT: Partial<Record<InstallState, string>> = {
  standalone: 'You are using the installed app.',
  installed: 'Your browser installed ClinBridge Practice. Open it from the Start menu or your app list.',
  accepted: 'You accepted. Your browser is installing ClinBridge Practice and opens it in its own window.',
  dismissed: 'Not installed. You can use the Practice demo in this tab, or install it later.',
};

function useInstall() {
  const state = useInstallState();
  const [help, setHelp] = useState(false);
  return { state, help: help && state !== 'standalone' && state !== 'installed', click: async () => setHelp(!(await askToInstall())) };
}

function InstallHelp() {
  return (
    <div className="lp-install-help" role="note" aria-label="How to install">
      <p>{INSTALL_STEPS[browserKind()]}</p>
      <p>No install option? ClinBridge Practice may already be installed: look in the Start menu. Private (Incognito) windows cannot install apps.</p>
    </div>
  );
}

/** The same installation in the "Desktop application" card, with its result and instructions there. */
export function InstallButton() {
  const { state, help, click } = useInstall();
  return (
    <>
      {RESULT[state] && <p className="lp-install-result">{RESULT[state]}</p>}
      {help && <InstallHelp />}
      {state !== 'standalone' && <button type="button" className="lp-button" onClick={() => void click()}><Icon name="install_desktop" /> Install Desktop App</button>}
    </>
  );
}

/** Public demo only: the landing page's actions, with the browser's own installation of the Practice app. */
export function InstallPractice({ launch, children }: { launch: ReactNode; children: ReactNode }) {
  const { state, help, click } = useInstall();
  const offline = useOfflineReady();
  const result = RESULT[state];
  return (
    <>
      <div className="lp-actions">
        {launch}
        {state !== 'standalone' && <button type="button" className="lp-secondary" aria-controls="install" onClick={() => void click()}><Icon name="install_desktop" /> Install Desktop App</button>}
        {children}
      </div>
      <section id="install" tabIndex={-1} className="lp-install" aria-label="About the Practice app">
        <p>Install ClinBridge on your laptop and explore the fictional nursing downtime demonstration, including offline charting.</p>
        {result && <p role="status" className="lp-install-result">{result}</p>}
        {help && <InstallHelp />}
        <p role="status" className="lp-install-offline"><Icon name={offline ? 'offline_pin' : 'downloading'} /> {offline ? 'Saved in this browser. It now opens without internet.' : 'Saving the app for offline use. Stay online until this is done.'}</p>
        <p>This is a web app that your browser installs. There is no .exe file. Fictional patients only: never enter real patient details.</p>
      </section>
    </>
  );
}
