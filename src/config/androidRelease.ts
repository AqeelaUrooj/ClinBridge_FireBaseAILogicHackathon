export const REPOSITORY = 'https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon';
export const APK_NAME = 'clinbridge-android-practice.apk';

export interface AndroidRelease {
  tag: string;
  version: string;
  bytes: number;
  sha256: string;
}

/**
 * The Android release that exists on GitHub. null: none is published, so the website shows no download address and the
 * button is off. Fill it in only after the release was published and its file was downloaded again and compared.
 */
export const ANDROID_RELEASE: AndroidRelease | null = null;

/** Null when the values can not be those of a real file. */
export function androidDownload(r: AndroidRelease | null) {
  if (!r || !/^android-v\d+\.\d+\.\d+$/.test(r.tag) || !/^\d+\.\d+\.\d+$/.test(r.version) || !/^[0-9a-f]{64}$/.test(r.sha256) || !(r.bytes > 1_000_000)) return null;
  return {
    apk: `${REPOSITORY}/releases/download/${r.tag}/${APK_NAME}`,
    page: `${REPOSITORY}/releases/tag/${r.tag}`,
    size: `${(r.bytes / 1_048_576).toFixed(1)} MB`,
  };
}
