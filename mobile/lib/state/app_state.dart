import 'dart:async';

import 'package:flutter/widgets.dart';

import '../config/policy.dart';
import '../core/clock.dart';
import '../core/util.dart';
import '../data/audit.dart';
import '../data/ctx.dart';
import '../data/native.dart';
import '../data/repos/entries.dart' as entries;
import '../data/repos/ops.dart' as ops;
import '../data/schema.dart';
import '../data/seed.dart';
import '../data/store.dart';
import '../data/vault.dart';

enum VaultStatus { checking, none, locked, unlocked, problem }

class PinResult {
  final bool ok;
  final String? error;
  final int triesLeft;
  final Duration lockedFor;
  const PinResult(this.ok, {this.error, this.triesLeft = 0, this.lockedFor = Duration.zero});
}

/// Keeps three things apart: the encrypted records (vault), the signed-in person, and the verified patient.
/// Leaving one closes the ones inside it.
class AppState extends ChangeNotifier with WidgetsBindingObserver {
  final NativeBridge native;
  final PracticeClock clock;

  /// Loads the approved synthetic dataset (bundled asset).
  final Future<String> Function() seedLoader;

  /// Test fixtures only: additional rows merged into the seed (never set by the installed app).
  final String? fixtureJson;

  /// Vault key rounds; tests lower it.
  final int vaultIterations;

  /// Wall clock for lockouts (so closing the app does not shorten one).
  final DateTime Function() wallNow;

  late final Vault vault;
  VaultStatus vaultStatus = VaultStatus.checking;
  String? vaultProblem;
  Store? _store;

  Practitioner? user;
  bool locked = false;
  String? lockReason;
  String? lockedAt;
  String? verifiedPatientId;

  /// Goes up whenever the person, the lock or the patient changes. Contexts from before are refused.
  int epoch = 0;

  /// Goes up after every save, so screens read the records again.
  int dataVersion = 0;

  /// App is in the background: contents are covered.
  bool covered = false;

  Timer? _idle, _vaultIdle;
  DateTime? _pausedAt;

  AppState({required this.native, required this.seedLoader, PracticeClock? clock, this.fixtureJson, this.vaultIterations = SecurityPolicy.pbkdf2Iterations, DateTime Function()? wallNow})
      : clock = clock ?? PracticeClock(),
        wallNow = wallNow ?? DateTime.now;

  Store get store => _store ?? (throw const AppError('The records are locked.'));
  bool get unlocked => vaultStatus == VaultStatus.unlocked && _store != null;
  bool get signedIn => unlocked && user != null && !locked;
  String get deviceId => store.meta('device_id') ?? 'unknown';
  String get unit => (_store?.all('snapshot').firstOrNull?['unit'] as String?) ?? 'Practice ward';
  DowntimeEvent? get downtime => unlocked ? ops.currentEvent(store) : null;
  ops.Phase get phase => ops.derivePhase(downtime);
  String get nowIso => clock.nowIso();

  /* ------------------------------ Vault ------------------------------ */

  Future<void> boot() async {
    WidgetsBinding.instance.addObserver(this);
    try {
      vault = Vault(native, await native.privateDir());
      unawaited(native.setRecentsHidden(true));
      switch (await vault.presence()) {
        case VaultPresence.none:
          vaultStatus = VaultStatus.none;
        case VaultPresence.ready:
          vaultStatus = VaultStatus.locked;
        case VaultPresence.missingEnvelope:
          vaultStatus = VaultStatus.problem;
          vaultProblem = 'The key file of the records on this phone is missing. The records were not opened, changed or deleted. Tell IT.';
        case VaultPresence.missingDatabase:
          vaultStatus = VaultStatus.problem;
          vaultProblem = 'The records file is missing on this phone. Nothing was created in its place. Tell IT.';
        case VaultPresence.missingDeviceKey:
          vaultStatus = VaultStatus.problem;
          vaultProblem = 'This phone\'s own key for the records is missing. The records were not opened, changed or deleted. Tell IT.';
      }
    } catch (e) {
      vaultStatus = VaultStatus.problem;
      vaultProblem = 'The app could not check its encrypted store: $e';
    }
    notifyListeners();
  }

  /// Create, open and reset run one after another, never at the same time.
  final _vaultLane = _Lane();
  Future<T> _inLane<T>(Future<T> Function() work) => _vaultLane.run(work);

  Future<void> createVault({String passphrase = kPracticePassphrase, String recovery = kPracticeRecoveryCode}) => _inLane(() => _create(passphrase, recovery));

  Future<void> _create(String passphrase, String recovery) async {
    await vault.create(passphrase: passphrase, recovery: recovery, iterations: vaultIterations);
    vaultStatus = VaultStatus.locked;
    await _open(passphrase: passphrase, created: true);
  }

  Future<void> unlockVault({String? passphrase, String? recovery}) => _inLane(() => _open(passphrase: passphrase, recovery: recovery));

  Future<void> _open({String? passphrase, String? recovery, bool created = false, bool reset = false}) async {
    if (unlocked) return; // opened meanwhile
    final s = await vault.open(passphrase: passphrase, recovery: recovery);
    try {
      await importPracticeSeed(s, native, await seedLoader(), clock: clock, extraJson: fixtureJson);
      clock.advanceTo(latestRecordedTime(s));
      vault.files.readyMark.writeAsStringSync('1');
      void audit(String action, Object after) => appendAudit(s, time: clock.nowIso(), userId: 'system', deviceId: s.meta('device_id')!, action: action, entity: 'vault', after: after);
      try {
        s.tx(() {
          audit(created ? 'vault_created' : 'vault_unlocked', {'method': passphrase != null ? 'passphrase' : 'recovery'});
          if (reset) audit('practice_reset', {'reset': true});
        });
      } on StorageError {
        // Saved records can still be read; lastStorageError tells the screens that saving does not work.
      }
    } catch (_) {
      s.close();
      rethrow;
    }
    _store = s;
    vaultStatus = VaultStatus.unlocked;
    _touchVault();
    notifyListeners();
  }

  /// Closes the encrypted records. Everyone signs in again after the next unlock.
  void lockVault() {
    _clearSession();
    _store?.close();
    _store = null;
    if (vaultStatus == VaultStatus.unlocked) vaultStatus = VaultStatus.locked;
    _vaultIdle?.cancel();
    notifyListeners();
  }

  /// Person-requested reset of the fictional records. Needs a signed-in person; the key envelope stays.
  Future<void> resetPractice({required String passphrase}) async {
    if (!signedIn) throw const NotAllowedError('Sign in first.');
    await _inLane(() => _reset(passphrase));
  }

  Future<void> _reset(String passphrase) async {
    (await vault.open(passphrase: passphrase)).close(); // a wrong passphrase stops here, before anything is locked or removed
    if (!signedIn) throw const NotAllowedError('Sign in first.');
    lockVault();
    vault.deletePracticeDatabase();
    try {
      await _open(passphrase: passphrase, reset: true);
    } catch (e) {
      throw AppError('The fictional records were removed, but loading them again failed: $e Unlock the records to try again.');
    }
  }

  /* ------------------------------ PIN (persistent limits) ------------------------------ */

  Duration pinLockedFor(String staffId) {
    final stored = (store.get('m_pin_state', staffId)?['locked_until'] as num?)?.toInt() ?? 0;
    final until = stored > (_memLock[staffId] ?? 0) ? stored : _memLock[staffId] ?? 0;
    final left = until - wallNow().millisecondsSinceEpoch;
    // A phone clock turned back can not make a lockout longer than the policy.
    if (left <= 0) return Duration.zero;
    return left > SecurityPolicy.pinLockout.inMilliseconds ? SecurityPolicy.pinLockout : Duration(milliseconds: left);
  }

  int pinTriesLeft(String staffId) => SecurityPolicy.maxPinTries - ((store.get('m_pin_state', staffId)?['fails'] as num?)?.toInt() ?? 0);

  /// Checks a PIN with the same counter and lockout for sign-in, unlock, second nurse and sign-off.
  Future<PinResult> checkPin(String staffId, String pin, {String wrongAction = 'staff_pin_wrong'}) => _pinLane.run(() => _checkPin(staffId, pin, wrongAction));

  /// One PIN check at a time, so parallel tries can not slip past the lockout.
  final _pinLane = _Lane();

  /// Lockouts that could not be written because the phone's storage refused it.
  final Map<String, int> _memLock = {};

  Future<PinResult> _checkPin(String staffId, String pin, String wrongAction) async {
    final s = store;
    final wait = pinLockedFor(staffId);
    if (wait > Duration.zero) return PinResult(false, error: 'Too many wrong tries. Wait ${wait.inSeconds + 1} seconds.', lockedFor: wait);
    final row = s.get('practitioner', staffId);
    if (row == null || !Practitioner(row).active) return const PinResult(false, error: 'This account is switched off.');
    if (!isValidPin(pin)) return PinResult(false, error: 'The PIN has 4 digits.', triesLeft: pinTriesLeft(staffId));
    final ok = await verifyPin(native, pin, Practitioner(row).pinHash);
    if (s.closed) throw const StaleContextError();
    void audit(String action) => appendAudit(s, time: nowIso, userId: staffId, deviceId: deviceId, action: action, entity: 'practitioner/$staffId', after: const {});
    if (ok) {
      if (s.get('m_pin_state', staffId) != null) {
        try {
          s.tx(() => s.put('m_pin_state', {'id': staffId, 'fails': 0, 'locked_until': 0}));
        } on StorageError {
          // reading must stay possible when saving does not work
        }
      }
      return const PinResult(true);
    }
    final fails = SecurityPolicy.maxPinTries - pinTriesLeft(staffId) + 1;
    final lock = fails >= SecurityPolicy.maxPinTries;
    try {
      s.tx(() {
        s.put('m_pin_state', {'id': staffId, 'fails': lock ? 0 : fails, 'locked_until': lock ? wallNow().add(SecurityPolicy.pinLockout).millisecondsSinceEpoch : 0});
        audit(wrongAction);
        if (lock) audit('staff_pin_lockout');
      });
    } on StorageError {
      // The wrong try could not be counted on the phone: lock at once instead of allowing unlimited tries.
      _memLock[staffId] = wallNow().add(SecurityPolicy.pinLockout).millisecondsSinceEpoch;
      notifyListeners();
      return const PinResult(false, error: 'Wrong PIN. The phone can not save the count, so wait 1 minute.', lockedFor: SecurityPolicy.pinLockout);
    }
    notifyListeners();
    return lock
        ? const PinResult(false, error: 'Too many wrong tries. Wait 1 minute.', lockedFor: SecurityPolicy.pinLockout)
        : PinResult(false, error: 'Wrong PIN · ${SecurityPolicy.maxPinTries - fails} tries left', triesLeft: SecurityPolicy.maxPinTries - fails);
  }

  /* ------------------------------ Session ------------------------------ */

  Future<PinResult> signIn(String staffId, String pin) async {
    final r = await checkPin(staffId, pin);
    if (!r.ok) return r;
    final person = Practitioner(store.get('practitioner', staffId)!);
    final sameAfterLock = locked && user?.id == staffId;
    user = person;
    locked = false;
    lockReason = null;
    verifiedPatientId = null; // always re-verify after a sign-in or a lock
    epoch++;
    if (!sameAfterLock) {
      try {
        store.tx(() => appendAudit(store, time: nowIso, userId: staffId, deviceId: deviceId, action: 'staff_signed_in', entity: 'practitioner/$staffId', after: {'role': person.role}));
      } on StorageError {
        // shown to the person by lastStorageError; reading stays possible
      }
    }
    touch();
    notifyListeners();
    return r;
  }

  void lock([String reason = 'person']) {
    if (user == null || locked) return;
    locked = true;
    lockReason = reason;
    lockedAt = nowIso;
    verifiedPatientId = null;
    epoch++;
    _idle?.cancel();
    notifyListeners();
  }

  void signOut() {
    _clearSession();
    notifyListeners();
  }

  void _clearSession() {
    user = null;
    locked = false;
    lockReason = null;
    verifiedPatientId = null;
    epoch++;
    _idle?.cancel();
  }

  /// Both identifiers were confirmed on screen for exactly this patient.
  void verifyPatient(String patientId, List<String> identifiers) {
    ops.recordPatientVerified(ctx(), patientId, identifiers); // the audit row is part of the check: no row, no chart
    verifiedPatientId = patientId;
    epoch++;
    saved();
  }

  void leavePatient() {
    if (verifiedPatientId == null) return;
    verifiedPatientId = null;
    epoch++;
    notifyListeners();
  }

  /// The context for one action. Refused when nobody is signed in.
  Ctx ctx() {
    if (!signedIn) throw const NotAllowedError('Sign in first.');
    final e = epoch, s = store;
    return Ctx(store: s, clock: clock, userId: user!.id, deviceId: deviceId, verifiedPatientId: verifiedPatientId, stillValid: () => signedIn && epoch == e && identical(_store, s));
  }

  /// Call after a successful write.
  void saved() {
    dataVersion++;
    notifyListeners();
  }

  /* ------------------------------ Two-person checks ------------------------------ */

  /// Independent second check: the witness's own PIN, eligible role, different person. Returns the attestation id.
  Future<(PinResult, String?)> cosign(Ctx c, {required String witnessId, required String pin, required String patientId, required String careTime, String? scheduledTime, required Doc values, required List<String> checklist}) async {
    if (witnessId == c.userId) return (const PinResult(false, error: 'The second check must be done by a different nurse.'), null);
    final r = await checkPin(witnessId, pin, wrongAction: 'cosign_wrong_pin');
    if (!r.ok) return (r, null);
    return (r, entries.recordAttestation(c, witnessId: witnessId, outcome: 'given', patientId: patientId, careTime: careTime, scheduledTime: scheduledTime, values: values, checklist: checklist));
  }

  Future<PinResult> shiftSignoff(Ctx c, {required List<String> roster, required String ownPin, required String incomingId, required String incomingPin}) async {
    if (incomingId == c.userId) return const PinResult(false, error: 'The incoming nurse must be a different person.');
    final a = await checkPin(c.userId, ownPin);
    if (!a.ok) return PinResult(false, error: 'Outgoing nurse: ${a.error}', lockedFor: a.lockedFor);
    final b = await checkPin(incomingId, incomingPin);
    if (!b.ok) return PinResult(false, error: 'Incoming nurse: ${b.error}', lockedFor: b.lockedFor);
    ops.recordShiftSignoff(c, roster: roster, incomingId: incomingId);
    saved();
    return b;
  }

  /// Local Practice transition to Back online (checklist + the admin's own PIN). Opens no connection.
  Future<PinResult> clearNetwork(Ctx c, List<String> ticked, String pin) async {
    final r = await checkPin(c.userId, pin);
    if (!r.ok) return r;
    ops.clearNetwork(c, ticked, pinOk: true);
    saved();
    return r;
  }

  /* ------------------------------ Idle and lifecycle ------------------------------ */

  /// Any touch or key: restarts the idle timers.
  void touch() {
    _touchVault();
    if (!signedIn) return;
    _idle?.cancel();
    _idle = Timer(SecurityPolicy.staffAutoLock, () => lock('idle'));
  }

  void _touchVault() {
    if (!unlocked) return;
    _vaultIdle?.cancel();
    _vaultIdle = Timer(SecurityPolicy.vaultIdleLock, lockVault);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      covered = false;
      final away = _pausedAt == null ? Duration.zero : wallNow().difference(_pausedAt!);
      _pausedAt = null;
      if (away >= SecurityPolicy.vaultIdleLock) {
        lockVault();
      } else if (away >= SecurityPolicy.staffAutoLock) {
        lock('idle');
      }
      notifyListeners();
    } else if (!covered) {
      covered = true;
      _pausedAt ??= wallNow();
      notifyListeners();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _idle?.cancel();
    _vaultIdle?.cancel();
    _store?.close();
    super.dispose();
  }
}

/// Runs one job at a time, in the order they were asked for.
class _Lane {
  Future<void>? _last;
  Future<T> run<T>(Future<T> Function() work) async {
    final before = _last;
    final done = Completer<void>();
    _last = done.future;
    try {
      if (before != null) await before;
      return await work();
    } finally {
      done.complete();
      if (identical(_last, done.future)) _last = null;
    }
  }
}

/// `AppScope.of(context)` rebuilds the caller on every state change.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);
  static AppState of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
  static AppState read(BuildContext c) => c.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
