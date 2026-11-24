import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import charting from './assets/charting.png';
import report from './assets/report.jpg';
import trend from './assets/trend.png';
import { Icon } from '../../components/ui';
import { FRONT_DETAIL, SHAPES, SILHOUETTE } from '../body/anatomy';
import bedside from './assets/bedside.jpg';
import tablet from './assets/tablet.jpg';
import handover from './assets/handover.jpg';
import './landing.css';

const sections = [
  ['overview', 'Overview'], ['features', 'Features'], ['workflow', 'Offline Workflow'],
  ['hybrid-ai', 'Hybrid AI'], ['recovery', 'Recovery'], ['faq', 'FAQ'],
] as const;
const repository = 'https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon';

const metrics = [
  ['Charting', 'Offline-first', 'Document on the configured laptop', 'offline_bolt'],
  ['Local records', 'AES-256', 'Encrypted storage for records and photos', 'lock'],
  ['Paper backup', '3 form types', 'Prepare sheets in the browser', 'print'],
  ['Reconciliation', 'FHIR R4', 'Download a structured Bundle file', 'download'],
] as const;

const steps = [
  ['Before an outage', 'Prepare', 'devices', 'Prepare and access local records', 'Set up permitted staff access and make the authorized patient list available on the laptop.', 'PIN sign-in · local patient list'],
  ['During an outage', 'Document', 'edit_note', 'Document and review offline', 'Verify the patient and record vitals, medicines, notes, fluids, labs and SBAR handovers.', 'Local charting · paper backup'],
  ['After an outage', 'Reconcile', 'sync_alt', 'Review and prepare the export', 'Inspect corrections and unresolved records, then download a FHIR R4 file for reconciliation.', 'Recovery worklist · FHIR Bundle'],
] as const;

const safeguards = [
  ['AES-256', 'Encrypted local records', 'Records and paper photos are encrypted on the configured laptop.'],
  ['19 tables', 'IndexedDB schema', 'Structured Practice documentation and recovery records.'],
  ['Versioned', 'Clinical corrections', 'Earlier entries and correction reasons remain in the history.'],
  ['SHA-256', 'Linked audit history', 'The audit hash chain supports integrity checks.'],
];

const previews = [
  { title: 'Bedside charting', image: charting, alt: 'Practice charting shortcuts for medicines, vitals, fluids, notes and paper photos.' },
  { title: 'Patient history', image: trend, alt: 'Oxygen saturation trend from the fictional Practice history.' },
  { title: 'Paper report', image: report, alt: 'Part of a synthetic handwritten Practice report: assessments, IV lines and plan. Not a medical record.' },
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

function BedsidePreview() {
  return (
    <figure className="lp-dashboard">
      <figcaption className="lp-dash-bar"><span><i /> Offline documentation · Practice preview</span><span>Fictional demonstration</span></figcaption>
      <div className="lp-dash-person">
        <strong className="lp-bed">4B</strong>
        <div><b>Practice patient 01</b><span> Fictional record</span><p>Bedside documentation · Ward 4 West</p></div>
      </div>
      <p className="lp-dash-notice"><Icon name="info" /> Illustrative values and anatomy for the Practice demo</p>
      <div className="lp-dash-grid">
        <div className="lp-dash-column">
          <div className="lp-readout"><small>Most recent observations</small><b>08:00</b><p>Care time from the Practice record</p></div>
          <div className="lp-readout"><small>Blood pressure</small><b>134/80 <span>mmHg</span></b><p>Recorded vital sign</p></div>
          <div className="lp-readout"><small>Pulse</small><b>74 <span>bpm</span></b><p>Recorded vital sign</p></div>
        </div>
        <div className="lp-dash-column">
          <div className="lp-readout-pair">
            <div className="lp-readout"><small>Oxygen saturation</small><b>97%</b><p>Confirmed observation</p></div>
            <div className="lp-readout"><small>Temperature</small><b>36.7 <span>°C</span></b><p>Illustrative measurement</p></div>
          </div>
          <div className="lp-dash-note"><b>Bedside record and review</b><span>Practice record history</span><p>Record observations at the bedside. Review medicines, notes and corrections in the patient history.</p><p>Paper forms and SBAR are available for the nursing shift.</p></div>
        </div>
        <div className="lp-dash-anatomy">
          <small>Anatomical body map</small><b>Documented sites</b>
          <svg viewBox="0 0 240 560" role="img" aria-label="Illustrative front view of the body map">
            <g fill="#f6f2ea" stroke="#6d8295" strokeWidth="2">{SILHOUETTE.map(key => <path key={key} d={SHAPES[key]} />)}</g>
            <g fill="none" stroke="#9aabba" strokeWidth="1.3">{FRONT_DETAIL.map(d => <path key={d} d={d} />)}</g>
          </svg>
          <div className="lp-anatomy-key"><span /> Injection and IV documentation</div>
        </div>
      </div>
      <div className="lp-dash-footer"><span><Icon name="description" /> Practice · chart, review and prepare paper forms</span><DemoLink /></div>
    </figure>
  );
}

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState(0);
  const [active, setActive] = useState<string>('overview');
  const current = previews[preview]!;

  return (
    <div className="landing">
      <a className="lp-skip" href="#overview">Skip to overview</a>
      <header className="lp-header" onKeyDown={event => {
        if (event.key === 'Escape' && menu && trigger.current?.getClientRects().length) {
          setMenu(false);
          trigger.current.focus();
        }
      }}>
        <div className="lp-header-inner">
          <a className="lp-brand" href="#overview" onClick={() => { setActive('overview'); setMenu(false); }}>
            <img src="/icon.svg" alt="" /><span>ClinBridge<small>Offline nursing documentation</small></span>
          </a>
          <button className="lp-menu" ref={trigger} aria-expanded={menu} aria-controls="public-nav" onClick={() => setMenu(!menu)}>Menu</button>
          <nav id="public-nav" aria-label="Public navigation" data-open={menu}>
            {sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined} onClick={() => {
              setActive(id);
              setMenu(false);
              document.getElementById(id)?.focus();
            }}>{label}</a>)}
            <div className="lp-mobile-demo"><DemoLink /></div>
          </nav>
          <div className="lp-header-demo"><DemoLink /></div>
        </div>
        <div className="lp-operations"><span><i /> Practice demonstration</span><span>Offline charting · Paper forms · FHIR R4 export</span></div>
      </header>
      <main>
        <section id="overview" tabIndex={-1} className="lp-hero">
          <div className="lp-wrap">
            <p className="lp-kicker"><i /> Offline-first nursing documentation</p>
            <h1>When the EHR goes down,<br />{' '}<em>nursing documentation continues.</em></h1>
            <p className="lp-intro">Chart locally, keep a paper backup and prepare for recovery. Explore the workflow with fictional Practice records.</p>
            <div className="lp-actions"><DemoLink /><a className="lp-secondary" href="#features">Explore Features ↓</a></div>
            <ul className="lp-metrics">{metrics.map(([label, value, detail, icon]) => (
              <li key={label}><div><small>{label}</small><Icon name={icon} /></div><strong>{value}</strong><p>{detail}</p></li>
            ))}</ul>
            <figure className="lp-photo lp-hero-photo">
              <img src={bedside} alt="Illustrative hospital scene of a nurse charting at a computer workstation" fetchPriority="high" />
              <span className="lp-photo-badge"><i /> Fictional bedside scene</span>
              <figcaption><small>Bedside documentation</small><h2>Keep charting during an outage.</h2><p>Record care at the workstation and review it in the Practice workflow.</p></figcaption>
            </figure>
            <BedsidePreview />
          </div>
        </section>
        <section id="workflow" tabIndex={-1} className="lp-tint"><div className="lp-wrap lp-section">
          <div className="lp-section-heading"><div><p className="lp-label">Clinical continuity</p><h2>What happens when the EHR goes offline?</h2></div><p>From preparing the workstation to reconciling the documentation after an outage.</p></div>
          <ol className="lp-steps">{steps.map(([time, status, icon, title, detail, annotation]) => <li key={status}>
            <div className="lp-step-status"><span>{time}</span><b>{status}</b></div><Icon name={icon} /><h3>{title}</h3><p>{detail}</p><small>{annotation}</small>
          </li>)}</ol>
        </div></section>
        <section id="features" tabIndex={-1} className="lp-wrap lp-section lp-features">
          <div className="lp-centered"><p className="lp-label">Clinical documentation</p><h2>Chart and review at the bedside</h2><p>Work with vitals, medicines, notes and paper forms in one Practice shift.</p></div>
          <div className="lp-gallery-controls" role="group" aria-label="Practice screenshots">
            {previews.map((v, i) => <button key={v.title} aria-pressed={i === preview} onClick={() => setPreview(i)}>{v.title}</button>)}
          </div>
          <div className="lp-feature-grid">
            <article id="hybrid-ai" tabIndex={-1}>
              <figure className="lp-photo lp-feature-photo"><img src={tablet} alt="Illustrative close-up of gloved hands at a bedside tablet" /><figcaption>Bedside documentation</figcaption></figure>
              <p className="lp-label">Paper capture and review</p><h3>From paper photo to reviewed entry</h3>
              <p>Compare an AI proposal with the paper photo before confirming an entry. System Down blocks cloud inference. The Gemini Nano integration awaits live verification.</p>
              <div className="lp-feature-details"><span><Icon name="vital_signs" /> Vitals and medication records</span><span><Icon name="history" /> Local review and audit history</span></div>
            </article>
            <article>
              <figure className="lp-photo lp-feature-photo lp-feature-alternate"><img src={tablet} alt="" /><figcaption>Practice workspace</figcaption></figure>
              <figure className="lp-gallery">
                <figcaption>Practice screenshot · {current.title}</figcaption>
                <img src={current.image} alt={current.alt} />
                {preview === 0 && <div className="lp-feature-readouts">
                  <div><small>Blood pressure</small><strong>134/80 <span>mmHg</span></strong></div>
                  <div><small>Pulse</small><strong>74 <span>bpm</span></strong></div>
                </div>}
              </figure>
            </article>
          </div>
        </section>
        <section id="recovery" tabIndex={-1} className="lp-dark"><div className="lp-wrap lp-section lp-proof">
          <div><p className="lp-label">Security and recovery</p><h2>Keep the record and its history together</h2><p>Chart locally, review unresolved entries and prepare a FHIR R4 export. Staff sign-in, role boundaries and patient verification guard clinical workflows.</p>
            <figure className="lp-photo lp-proof-photo"><img src={handover} alt="Illustrative clinical team reviewing a handover at a workstation" /><figcaption>Illustrative shift handover</figcaption></figure>
          </div>
          <div className="lp-safeguards">{safeguards.map(([value, title, detail]) => <article key={title}><strong>{value}</strong><h3>{title}</h3><p>{detail}</p></article>)}</div>
        </div></section>
        <section className="lp-tint lp-trust"><div className="lp-wrap lp-trust-grid">
          <article><Icon name="science" /><div><h3>What Practice demonstrates</h3><p>Verify a fictional patient, chart offline, review saved history and prepare a paper packet or FHIR export.</p></div></article>
          <article><Icon name="info" /><div><h3>Prototype scope</h3><p>ClinBridge is for fictional Practice records. Hospital deployments and approval for real patient care are outside the demonstrated scope.</p></div></article>
        </div></section>
        <section id="faq" tabIndex={-1} className="lp-tint"><div className="lp-wrap lp-section lp-faq">
          <div className="lp-centered"><p className="lp-label">Prototype details</p><h2>Frequently asked questions</h2></div>
          {questions.map(([question, answer]) => <details key={question}><summary>{question}<Icon name="expand_more" /></summary><p>{answer}</p></details>)}
        </div></section>
        <section className="lp-cta"><div className="lp-wrap"><h2>Walk through a Practice shift</h2><p>Explore local charting, paper backup and structured recovery with fictional records.</p><DemoLink /></div></section>
      </main>
      <footer className="lp-footer">
        <div className="lp-footer-strip"><div className="lp-wrap"><span><Icon name="description" /> Prototype documentation</span><div><a href="#workflow">Offline workflow</a><a href="#recovery">Recovery and export</a><a href="#faq">Practice FAQ</a></div></div></div>
        <div className="lp-wrap lp-footer-grid">
          <div><a className="lp-brand" href="#overview"><img src="/icon.svg" alt="" />ClinBridge</a><p>Offline-first nursing documentation prototype.<br />Fictional Practice records only.</p></div>
          <nav aria-label="Footer features"><h3>Platform</h3><a href="#features">Clinical workflows</a><a href="#hybrid-ai">Paper capture and AI</a><a href="#recovery">Recovery and export</a></nav>
          <nav aria-label="Footer navigation"><h3>Project</h3><a href={repository}>GitHub source</a><a href={repository + '/blob/main/LICENSE'}>Apache-2.0 license</a><a href="#faq">FAQ</a></nav>
          <div><h3>Practice</h3><DemoLink /></div>
          <p className="lp-footer-note">ClinBridge source is available under Apache-2.0. Practice screens contain fictional records.</p>
        </div>
      </footer>
    </div>
  );
}
