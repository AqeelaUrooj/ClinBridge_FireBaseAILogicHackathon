import type { EntryWithChild } from '../../db/repos/entries';
import type { MedAdmin } from '../../db/schema';
import { siteRegion } from './regions';

interface MedicationSite {
  item: EntryWithChild;
  medication: MedAdmin;
  site: string;
}

interface MappedSite extends MedicationSite {
  regionId: string;
  kind: 'injection' | 'iv';
}

interface RegionAdministrations {
  records: MappedSite[];
  mostRecentCareTime?: string;
}

const careTimestamp = ({ item }: MedicationSite) => {
  const value = Date.parse(item.entry.care_time);
  return Number.isFinite(value) ? value : -Infinity;
};

export function medicationSites(patientId: string, records: readonly EntryWithChild[]) {
  const marked: MappedSite[] = [];
  const unmapped: MedicationSite[] = [];
  const administrations = new Map<string, RegionAdministrations>();

  for (const item of records) {
    const { entry } = item;
    // The repository retires the previous version atomically when it confirms its replacement.
    if (entry.patient_id !== patientId || entry.type !== 'med_admin' || entry.status !== 'confirmed') continue;
    const medication = item.child as MedAdmin | undefined;
    const site = medication?.site?.trim();
    if (!medication || medication.entry_id !== entry.id || !site) continue;

    const region = siteRegion(site);
    if (!region) {
      unmapped.push({ item, medication, site });
      continue;
    }
    const kind = site.includes('IV line') || medication.route === 'IV' ? 'iv' : 'injection';
    const record: MappedSite = { item, medication, site, regionId: region.id, kind };
    marked.push(record);
    if (medication.event !== 'administered') continue;

    const summary = administrations.get(region.id) ?? { records: [] };
    summary.records.push(record);
    administrations.set(region.id, summary);
  }
  for (const summary of administrations.values()) {
    summary.records.sort((a, b) => {
      const first = careTimestamp(a), second = careTimestamp(b);
      return first === second ? b.item.entry.entry_time.localeCompare(a.item.entry.entry_time) : second - first;
    });
    const latest = summary.records[0]!;
    if (careTimestamp(latest) !== -Infinity) summary.mostRecentCareTime = latest.item.entry.care_time;
  }

  return { marked, unmapped, administrations };
}

export const administrationCountLabel = (count: number) =>
  `${count} documented administration${count === 1 ? '' : 's'}`;
