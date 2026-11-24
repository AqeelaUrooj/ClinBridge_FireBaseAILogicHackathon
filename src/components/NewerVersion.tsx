import { useNewerVersion } from '../lib/offlineCopy';
import { Icon } from './ui';

/**
 * A newer version is stored and waits. It is never switched on by a reload of our own: that would throw away typing
 * that is not saved yet. The browser uses it once every ClinBridge window is closed. Records are not touched.
 */
export function NewerVersion() {
  if (!useNewerVersion()) return null;
  return (
    <p role="status" className="fixed bottom-0 inset-x-0 z-50 bg-primary text-on-primary px-space-md py-2 flex items-center justify-center gap-2 font-body-sm text-body-sm print:hidden">
      <Icon name="update" className="text-[18px]" />A newer version of ClinBridge is ready. Close every ClinBridge window and tab, then open it again. Your records stay.
    </p>
  );
}
