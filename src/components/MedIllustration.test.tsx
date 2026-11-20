import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MEDICAL_ASSETS, MedIllustration, assetUrl, type MedicalAsset } from './MedIllustration';

describe('medical illustration library', () => {
  it('every registered illustration has a bundled local file', () => {
    for (const name of Object.keys(MEDICAL_ASSETS) as MedicalAsset[]) {
      const url = assetUrl(name);
      expect(url, name).toBeTruthy();
      expect(url!).not.toMatch(/^https?:\/\//); // never an external CDN
    }
  });
  it('is decorative (hidden, empty alt) unless a label is given', () => {
    const { container, rerender } = render(<MedIllustration name="vitals/heart" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    rerender(<MedIllustration name="vitals/heart" label="Heart" />);
    expect(container.querySelector('img')!.getAttribute('alt')).toBe('Heart');
    expect(container.querySelector('img')!.hasAttribute('aria-hidden')).toBe(false);
  });
});
