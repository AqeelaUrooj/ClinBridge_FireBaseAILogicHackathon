import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import charting from './assets/charting.png';
import paper from './assets/paper.png';
import trend from './assets/trend.png';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';
import './landing.css';

const sections = [
  ['overview', 'Overview'], ['features', 'Features'], ['workflow', 'Offline Workflow'],
  ['hybrid-ai', 'Hybrid AI'], ['recovery', 'Recovery'], ['faq', 'FAQ'],
] as const;
const repository = 'https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon';

const steps = [
  ['Prepare', 'Install the app, set up staff access and make the authorized patient list available on the laptop.'],
  ['Document', 'Verify the patient and record care locally. Use paper forms when bedside charting needs to continue on paper.'],
  ['Review', 'Inspect confirmed entries, corrections and unresolved items in the recovery worklist.'],
  ['Export', 'Download a FHIR R4 Bundle file for an approved downstream reconciliation process.'],
];

const features: { title: string; art: MedicalAsset; text: string }[] = [
  { title: 'Chart at the bedside', art: 'vitals/bp-monitor', text: 'Record vitals, nursing notes, fluid balance, laboratory observations and SBAR handovers offline.' },
  { title: 'Follow the patient history', art: 'medication/syringe', text: 'Review the patient summary, medication administrations and version history. Body-map pins show documented injection and IV sites.' },
  { title: 'Take charting to paper', art: 'workflows/checklist', text: 'Prepare a MAR, vitals/neuro/I&O flowsheet or SBAR sheet. Assemble packets and print through the browser dialog.' },
];

const previews = [
  { title: 'Bedside charting', image: charting, alt: 'Practice charting shortcuts for medicines, vitals, fluids, notes and paper photos.' },
  { title: 'Patient history', image: trend, alt: 'Oxygen saturation trend from the fictional Practice history.' },
  { title: 'Paper forms', image: paper, alt: 'The Practice paper-form selector with MAR, vitals and SBAR options.' },
];

const questions = [
  ['Can ClinBridge work without internet access?', 'Yes. After initial installation and local setup, the cached app and the records on that laptop are available offline.'],
  ['What can nurses document offline?', 'Vitals, medication events, intake and output, nursing notes, laboratory observations and SBAR handovers.'],
  ['How does the hybrid AI demonstration work?', 'A nurse reviews a proposal against the source photo before confirming it. Firebase AI Logic supports cloud inference when cloud use is permitted. System Down blocks cloud inference.'],
  ['Has genuine on-device inference been verified?', 'The Gemini Nano integration has been tested with mock browser APIs. Live verification on compatible hardware is still pending.'],
  ['Does ClinBridge synchronize directly with a hospital EHR?', 'No. The recovery workflow produces a downloadable FHIR R4 Bundle file for downstream review.'],
  ['Can laptops synchronize directly with each other?', 'No. Each laptop maintains its own local vault. Peer-to-peer replication is outside the prototype.'],
  ['How are corrections and audit history managed?', 'A correction records a reason and a new version. The earlier version remains in the history, and audit entries are linked in a hash chain.'],
  ['Can I try it with fictional patients?', 'Yes. Launch Practice Demo, select a Practice staff member and use the Practice PIN shown on the sign-in screen.'],
  ['Is ClinBridge approved for real patient care?', 'No. ClinBridge is a demonstration prototype for fictional Practice records.'],
  ['How does paper backup work?', 'Select the forms, review the patient identifiers, then open the browser print dialog. The packet builder can prepare sheets for multiple patients.'],
];

function DemoLink() {
  return <Link className="lp-button" to="/sign-in?demo=practice">Launch Practice Demo <span aria-hidden="true">→</span></Link>;
}

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState(0);
  const current = previews[preview]!;
  return <div className="landing">
    <a className="lp-skip" href="#overview">Skip to overview</a>
    <header className="lp-header" onKeyDown={event => {
      if (event.key === 'Escape' && menu && trigger.current?.getClientRects().length) {
        setMenu(false);
        trigger.current.focus();
      }
    }}>
      <a className="lp-brand" href="#overview"><img src="/icon.svg" alt="" />ClinBridge</a>
      <button className="lp-menu" ref={trigger} aria-expanded={menu} aria-controls="public-nav" onClick={() => setMenu(!menu)}>Menu</button>
      <nav id="public-nav" aria-label="Public navigation" data-open={menu}>
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => {setMenu(false); document.getElementById(id)?.focus();}}>{label}</a>)}
        <DemoLink />
      </nav>
    </header>
    <main>
      <section id="overview" tabIndex={-1} className="lp-hero">
        <div className="lp-wrap">
          <p className="lp-kicker"><span /> Offline-first nursing documentation</p>
          <h1>When the EHR goes down,<br /><em>nursing documentation still needs a plan.</em></h1>
          <p className="lp-intro">Chart locally, keep a paper backup and prepare for recovery. Explore the workflow with fictional Practice records.</p>
          <div className="lp-actions"><DemoLink /><a className="lp-secondary" href="#features">Explore Features ↓</a></div>
          <figure className="lp-preview">
            <figcaption><span>ClinBridge <b>/ Practice preview</b></span><span>Bedside charting</span></figcaption>
            <div className="lp-preview-body"><div><MedIllustration name="workflows/device" size={88} /><h2>The bedside workspace</h2><p>Chart care on the ward laptop, even during an outage.</p></div><img src={charting} alt={previews[0]!.alt} /></div>
          </figure>
        </div>
      </section>
      <section id="workflow" tabIndex={-1} className="lp-wrap lp-section"><p className="lp-label">Offline workflow</p><h2>From preparation to recovery</h2>
        <ol className="lp-steps">{steps.map(([title, text], i) => <li key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </section>
      <section id="features" tabIndex={-1} className="lp-tint"><div className="lp-wrap lp-section"><p className="lp-label">Features</p><h2>A workspace for the nursing shift</h2>
        <div className="lp-cards">{features.map(f => <article key={f.title}><MedIllustration name={f.art} size={52} /><h3>{f.title}</h3><p>{f.text}</p></article>)}</div>
        <div className="lp-gallery"><div className="lp-gallery-controls" role="group" aria-label="Practice screenshots">
          {previews.map((v,i) => <button key={v.title} aria-pressed={i === preview} onClick={() => setPreview(i)}>{v.title}</button>)}
        </div><figure><img src={current.image} alt={current.alt} /><figcaption>Practice screenshot · {current.title}</figcaption></figure></div>
      </div></section>
      <section id="hybrid-ai" tabIndex={-1} className="lp-wrap lp-section lp-ai"><MedIllustration name="workflows/paper-photo" size={110} /><div><p className="lp-label">Hybrid AI</p><h2>From paper photo to reviewed entry</h2><p>Compare a proposed extraction with the source photo before confirming a record. Firebase AI Logic cloud inference has been demonstrated with synthetic inputs. System Down blocks cloud inference. The Gemini Nano on-device path awaits live verification on compatible hardware.</p></div></section>
      <section id="recovery" tabIndex={-1} className="lp-dark"><div className="lp-wrap lp-section"><p className="lp-label">Security and recovery</p><h2>Keep the record and its history together</h2><div className="lp-safeguards">{[
        ['Local vault', 'Encrypted records and photos stay available on the configured laptop.'],
        ['Staff access', 'PIN sign-in, role boundaries and patient verification guard clinical workflows.'],
        ['Record integrity', 'Versioned corrections preserve earlier entries. A hash chain supports audit verification.'],
        ['Reconciliation', 'Review unresolved items and export a structured FHIR R4 file.'],
      ].map(([title, desc]) => <article key={title}><h3>{title}</h3><p>{desc}</p></article>)}</div></div></section>
      <section id="faq" tabIndex={-1} className="lp-wrap lp-section lp-faq"><p className="lp-label">FAQ</p><h2>Questions about the prototype</h2>{questions.map(([q,a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
      <section className="lp-cta"><h2>Walk through a Practice shift</h2><p>Use fictional records to explore documentation and recovery.</p><DemoLink /></section>
    </main>
    <footer className="lp-wrap lp-footer"><div><strong>ClinBridge</strong><p>Offline-first nursing documentation prototype.<br />Fictional Practice data only. Not approved for real patient care.</p></div><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#faq">FAQ</a><a href={repository}>GitHub source</a><a href={repository + '/blob/main/LICENSE'}>Apache-2.0 license</a><DemoLink /></nav></footer>
  </div>;
}
