import { AppProvider, SessionProvider } from './state/app';
import { App } from './App';

export default function ClinicalApplication() {
  return <AppProvider><SessionProvider><App /></SessionProvider></AppProvider>;
}
