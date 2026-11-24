import type { VitalSign } from '../../db/schema';
import { loadReportFonts, stack } from '../handwriting/fonts';
import { between, layout, rand, type Pen } from '../handwriting/hand';

const PEN: Pen = { main: 'CB Kalam', alt: 'CB Caveat', altShare: 0.2, ink: '#1b2f8f', slant: 4, weight: 0.5, mess: 1 };

/** Writes one text by hand on a canvas (same layout as the handwritten reports). */
function write(g: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, width: number, seed: string) {
  let s = size, lines = layout(t, PEN, s, width, seed, true);
  while (lines.length > 1 && s > 14) { s -= 1; lines = layout(t, PEN, s, width, seed, true); }
  g.fillStyle = PEN.ink;
  g.strokeStyle = PEN.ink;
  lines.forEach((line, i) => line.words.forEach((w) => {
    g.save();
    g.translate(x + w.x, y + i * s * 1.1 + w.y);
    g.rotate((w.turn * Math.PI) / 180);
    g.transform(w.wide, 0, -Math.tan(((w.lean + PEN.slant) * Math.PI) / 180), 1, 0, 0);
    g.globalAlpha = w.opacity;
    g.lineWidth = w.stroke;
    g.font = `${w.px}px ${stack(w.family)}`;
    const rot = w.rotate.split(' ').map(Number), dy = w.dy.split(' ').map(Number), dx = w.dx.split(' ').map(Number);
    let cx = 0, cy = 0;
    Array.from(w.t).forEach((ch, k) => {
      cx += dx[k]!;
      cy += dy[k]!;
      g.save();
      g.translate(cx, cy);
      g.rotate((rot[k]! * Math.PI) / 180);
      g.fillText(ch, 0, 0);
      g.strokeText(ch, 0, 0);
      g.restore();
      cx += g.measureText(ch).width;
    });
    g.restore();
  }));
}

/**
 * Draws a SYNTHETIC paper vitals form (PNG) from known Practice values, for the Device vs Cloud comparison: printed form,
 * handwritten values. Browser only (canvas). Marked "PRACTICE · FICTIONAL" on the image itself.
 */
export async function drawSyntheticVitalsForm(v: Partial<VitalSign>, patientLabel: string, time: string): Promise<Blob> {
  await loadReportFonts();
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 620;
  const g = c.getContext('2d')!;
  const seed = `${patientLabel}|${time}`, r = rand(seed);
  const paper = g.createLinearGradient(0, 0, c.width, c.height);
  paper.addColorStop(0, '#f6f5f0');
  paper.addColorStop(1, '#e6e4dd');
  g.fillStyle = paper;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '70,65,55'},${between(r, 0.03, 0.1).toFixed(3)})`; g.fillRect(r() * c.width, r() * c.height, between(r, 0.6, 2.2), between(r, 0.6, 1.6)); }
  g.strokeStyle = '#15181d';
  g.lineWidth = 2;
  g.strokeRect(20, 20, c.width - 40, c.height - 40);
  g.fillStyle = '#a3261b';
  g.font = '700 20px Inter, sans-serif';
  g.fillText('PRACTICE · FICTIONAL PATIENT · NOT A CLINICAL RECORD', 40, 56);
  g.fillStyle = '#15181d';
  g.font = '700 28px Inter, sans-serif';
  g.fillText('VITAL SIGNS — DOWNTIME PAPER FORM', 40, 104);
  g.font = '700 19px Inter, sans-serif';
  g.fillText('Patient:', 40, 148);
  g.fillText('Time:', 620, 148);
  write(g, patientLabel, 128, 149, 31, 470, `${seed}|p`);
  write(g, time, 686, 149, 31, 170, `${seed}|t`);
  const rows: [string, string][] = [
    ['Blood pressure (mmHg)', v.bp_systolic != null && v.bp_diastolic != null ? `${v.bp_systolic} / ${v.bp_diastolic}` : ''],
    ['Pulse (/min)', v.heart_rate != null ? String(v.heart_rate) : ''],
    ['Resp rate (/min)', v.resp_rate != null ? String(v.resp_rate) : ''],
    ['SpO2 (%)', v.spo2 != null ? String(v.spo2) : ''],
    ['Temp (°C)', v.temp_c != null ? String(v.temp_c) : ''],
    ['Pain (0-10)', v.pain_0_10 != null ? String(v.pain_0_10) : ''],
    ['Consciousness (AVPU)', v.consciousness ?? ''],
  ];
  g.strokeStyle = '#4c525c';
  g.lineWidth = 1.2;
  g.strokeRect(40, 172, c.width - 80, rows.length * 54);
  rows.forEach(([label, value], i) => {
    const y = 172 + i * 54;
    g.strokeStyle = '#4c525c';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(40, y);
    g.lineTo(c.width - 40, y);
    g.moveTo(430, y);
    g.lineTo(430, y + 54);
    g.stroke();
    g.fillStyle = '#15181d';
    g.font = '400 20px Inter, sans-serif';
    g.fillText(label, 56, y + 34);
    if (value) write(g, value, 462 + between(r, -8, 14), y + 37, 35, 380, `${seed}|${i}`);
  });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the form'))), 'image/png'));
}
