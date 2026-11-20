import type { VitalSign } from '../../db/schema';

/**
 * Draws a SYNTHETIC paper vitals form (PNG) from known Practice values, for the Device vs Cloud comparison.
 * Browser only (canvas). Marked "PRACTICE · FICTIONAL" on the image itself.
 */
export async function drawSyntheticVitalsForm(v: Partial<VitalSign>, patientLabel: string, time: string): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 620;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fdfbf3';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#7d8aa0';
  g.lineWidth = 2;
  g.strokeRect(20, 20, c.width - 40, c.height - 40);
  g.fillStyle = '#b3261e';
  g.font = 'bold 22px sans-serif';
  g.fillText('PRACTICE · FICTIONAL PATIENT · NOT A CLINICAL RECORD', 40, 60);
  g.fillStyle = '#1c2536';
  g.font = 'bold 30px sans-serif';
  g.fillText('VITAL SIGNS — DOWNTIME PAPER FORM', 40, 110);
  g.font = '22px sans-serif';
  g.fillText(`Patient: ${patientLabel}`, 40, 150);
  g.fillText(`Time: ${time}`, 560, 150);
  const rows: [string, string][] = [
    ['Blood pressure (mmHg)', v.bp_systolic != null && v.bp_diastolic != null ? `${v.bp_systolic} / ${v.bp_diastolic}` : ''],
    ['Pulse (/min)', v.heart_rate != null ? String(v.heart_rate) : ''],
    ['Resp rate (/min)', v.resp_rate != null ? String(v.resp_rate) : ''],
    ['SpO2 (%)', v.spo2 != null ? String(v.spo2) : ''],
    ['Temp (°C)', v.temp_c != null ? String(v.temp_c) : ''],
    ['Pain (0-10)', v.pain_0_10 != null ? String(v.pain_0_10) : ''],
    ['Consciousness (AVPU)', v.consciousness ?? ''],
  ];
  rows.forEach(([label, value], i) => {
    const y = 210 + i * 54;
    g.strokeStyle = '#c4cad6';
    g.beginPath();
    g.moveTo(40, y + 14);
    g.lineTo(c.width - 40, y + 14);
    g.stroke();
    g.fillStyle = '#44506a';
    g.font = '22px sans-serif';
    g.fillText(label, 40, y);
    g.fillStyle = '#16307a';
    g.font = 'italic 34px "Comic Sans MS", "Segoe Print", cursive';
    g.fillText(value, 480, y + 4);
  });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the form'))), 'image/png'));
}
