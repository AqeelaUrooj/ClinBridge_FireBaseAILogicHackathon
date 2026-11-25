/// Clinical and security policy, ported without change from the ClinBridge web app
/// (src/config/clinicalPolicy.ts, clinicalWarnings.ts, medicationPolicy.ts, securityPolicy.ts at main 5e18173).
/// PROTOTYPE values for fictional patients. Not approved clinical policy.
library;

const bool kPolicyApproved = false;
const String kPolicyNote = 'Synthetic prototype settings for fake patients only. Not approved clinical policy.';

class HighAlertEntry {
  final String id, label;
  final List<String> match, events;
  const HighAlertEntry(this.id, this.label, this.match, [this.events = const ['administered', 'rate_changed']]);
}

/// Partial example list (listIsComplete = false in the web policy): not being listed does NOT mean low risk.
const List<HighAlertEntry> kHighAlert = [
  HighAlertEntry('insulin', 'Insulin', ['insulin']),
  HighAlertEntry('heparin', 'Heparin', ['heparin']),
  HighAlertEntry('hydromorphone', 'HYDROmorphone', ['hydromorphone']),
  HighAlertEntry('potassium-chloride', 'Potassium chloride', ['potassium chloride']),
];

/// Roles that may act as second checker.
const List<String> kSecondCheckerRoles = ['RN'];

/// Queue order only (higher first). Not a clinical score.
const Map<String, int> kCategoryRank = {'meds': 6, 'results': 5, 'vitals': 4, 'io': 3, 'notes': 2, 'other': 1};

/// Items an admin must confirm before network clearance (Back online).
const List<String> kNetworkChecklist = [
  'IT / security team says the hospital network is safe to use again',
  'EHR team says back-entry into the main record can start',
  'Downtime lead approved switching this unit to Back online',
];

/// Warning ranges (engineering placeholders, NOT clinically approved). They never block saving.
const Map<String, (double, double)> kVitalWarnings = {
  'bp_systolic': (90, 140),
  'bp_diastolic': (60, 90),
  'heart_rate': (60, 100),
  'resp_rate': (12, 20),
  'temp_c': (36.1, 37.8),
  'spo2': (92, 100),
  'glucose_mgdl': (70, 180),
};

const List<String> kDoseUnits = ['mg', 'mcg', 'g', 'mL', 'units', 'mmol', 'tablet'];
const List<String> kRoutes = ['PO', 'IV', 'IM', 'SC', 'SL', 'PR', 'INH', 'TOP'];
const List<String> kRateUnits = ['units/h', 'mL/h'];
const Map<String, String> kRouteLabel = {
  'PO': 'by mouth', 'IV': 'into a vein', 'IM': 'into a muscle', 'SC': 'under the skin', 'SL': 'under the tongue',
  'PR': 'rectal', 'INH': 'inhaled', 'TOP': 'on the skin',
};
const List<String> kSiteWords = [
  'Abdomen, left side', 'Abdomen, right side',
  'Left forearm IV line', 'Right forearm IV line', 'Left hand IV line', 'Right hand IV line',
];

class SecurityPolicy {
  /// Lock the encrypted records (passphrase again) after this long without use.
  static const Duration vaultIdleLock = Duration(minutes: 60);

  /// Lock the signed-in staff session after this long without use (web AUTO_LOCK_MS).
  static const Duration staffAutoLock = Duration(minutes: 5);
  static const int pbkdf2Iterations = 600000;

  /// Iterations for PINs set in the app (web hashPin default) and for the seeded Practice PIN (web seed).
  static const int pinIterations = 150000;
  static const int seedPinIterations = 60000;

  /// Wrong PIN policy (web SignIn.tsx MAX_TRIES / LOCKOUT_MS).
  static const int maxPinTries = 5;
  static const Duration pinLockout = Duration(seconds: 60);
}

/// PUBLIC practice secrets (web decision C1): they protect only fictional data and give it NO confidentiality
/// against someone who has this app and this phone. They are shown on screen on purpose.
const String kPracticePassphrase = 'practice only fake patients';
const String kPracticeRecoveryCode = 'PRAC-TXCE-FAKE-DATA-NLYX-2222-3333-4444';

/// Controlled demo credential of the authorised Practice seed (web src/db/seed.ts). Fictional staff only.
const String kPracticePin = '2468';
