import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:sqlite3/sqlite3.dart';

import '../core/util.dart';
import 'schema.dart';

/// Encrypted local database (SQLCipher). Every row is a JSON document under its schema field names.
/// All access is synchronous, so a [tx] block is one real SQLite transaction: all of it is saved, or none of it.
class Store {
  static const int schemaVersion = 1;
  final Database _db;
  int _depth = 0;
  bool _closed = false;

  /// Tests only: called before every write and before COMMIT with the operation name. Throwing simulates a failure.
  @visibleForTesting
  void Function(String op)? fault;

  /// Set after a storage failure, or by an approved freeze: every further write is refused. Reading still works.
  String? readOnlyReason;

  /// The last write that the phone's storage refused; null again after the next successful save.
  String? lastStorageError;

  Store._(this._db);

  /// Opens (or creates) the encrypted file. Refuses to run on a SQLite without encryption.
  static Store open(String path, List<int> key) => _open(path, key, true);

  /// Tests only: opens without migrating.
  @visibleForTesting
  static Store openRaw(String path, List<int> key) => _open(path, key, false);

  static Store _open(String path, List<int> key, bool migrate) {
    final db = sqlite3.open(path);
    try {
      final version = db.select('PRAGMA cipher_version');
      if (version.isEmpty || '${version.first.values.first ?? ''}'.isEmpty) {
        throw const AppError('The encrypted database engine is missing. The records were not opened.');
      }
      db.execute("PRAGMA key = \"x'${hexOf(key)}'\"");
      try {
        db.select('SELECT count(*) FROM sqlite_master');
      } on SqliteException catch (e) {
        if (e.resultCode == 26) throw const AppError('The records could not be opened with this key. Nothing was changed or deleted.');
        throw AppError('The records file could not be read (${e.message}). Nothing was changed or deleted.');
      }
      db.execute('PRAGMA temp_store = MEMORY');
      db.execute('PRAGMA journal_mode = WAL');
      db.execute('PRAGMA synchronous = FULL');
      db.execute('PRAGMA secure_delete = ON');
      final s = Store._(db);
      if (migrate) s._migrate();
      return s;
    } catch (_) {
      db.dispose();
      rethrow;
    }
  }

  String get cipherVersion => '${_db.select('PRAGMA cipher_version').first.values.first}';

  void _migrate() {
    final v = _db.select('PRAGMA user_version').first.values.first as int;
    if (v > schemaVersion) throw const AppError('These records were made by a newer version of the app. Nothing was changed.');
    if (v == schemaVersion) return;
    _db.execute('BEGIN IMMEDIATE');
    try {
      if (v < 1) {
        for (final t in [...kClinicalTables, ...kMobileTables]) {
          _db.execute('CREATE TABLE IF NOT EXISTS $t (id TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL${t == 'm_photo' ? ', bytes BLOB' : ''})');
          for (final col in kIndexes[t] ?? const <String>[]) {
            _db.execute("CREATE INDEX IF NOT EXISTS ix_${t}_$col ON $t (json_extract(doc, '\$.$col'))");
          }
        }
        _db.execute("CREATE UNIQUE INDEX ux_audit_seq ON audit_log (json_extract(doc, '\$.seq'))");
        _db.execute("CREATE UNIQUE INDEX ux_entry_counter ON entry (json_extract(doc, '\$.device_id'), json_extract(doc, '\$.counter'))");
        // Append-only: the database itself refuses to rewrite history.
        for (final t in ['audit_log', 'm_attestation', 'm_shift_signoff', 'm_resolution', 'm_photo', 'handoff']) {
          _db.execute("CREATE TRIGGER no_update_$t BEFORE UPDATE ON $t BEGIN SELECT RAISE(ABORT, '$t is append-only'); END");
          _db.execute("CREATE TRIGGER no_delete_$t BEFORE DELETE ON $t BEGIN SELECT RAISE(ABORT, '$t is append-only'); END");
        }
        _db.execute("CREATE TRIGGER no_delete_entry BEFORE DELETE ON entry BEGIN SELECT RAISE(ABORT, 'entries are never deleted'); END");
      }
      _db.execute('PRAGMA user_version = $schemaVersion');
      _db.execute('COMMIT');
    } catch (_) {
      _db.execute('ROLLBACK');
      rethrow;
    }
  }

  /// Tests only: raw SQL on the open database.
  @visibleForTesting
  void debugExec(String sql) => _db.execute(sql);
  @visibleForTesting
  int debugSelect(String sql) => _db.select(sql).first.values.first as int;
  @visibleForTesting
  List<String> debugNames(String where) => [for (final r in _db.select('SELECT name FROM sqlite_master WHERE $where')) '${r.values.first}'];

  bool get closed => _closed;

  void close() {
    if (_closed) return;
    _closed = true;
    _db.dispose();
  }

  void _check() {
    if (_closed) throw const AppError('The records are locked.');
  }

  /// One transaction. Nested calls join the outer one.
  T tx<T>(T Function() work) {
    _check();
    if (_depth > 0) return work();
    if (readOnlyReason != null) throw StorageError(readOnlyReason!);
    try {
      _db.execute('BEGIN IMMEDIATE');
    } on SqliteException catch (e) {
      throw _map(e);
    }
    _depth++;
    try {
      final r = work();
      fault?.call('commit');
      _db.execute('COMMIT');
      lastStorageError = null;
      return r;
    } catch (e) {
      try {
        _db.execute('ROLLBACK');
      } catch (_) {}
      final err = e is SqliteException ? _map(e) : e;
      if (err is StorageError) lastStorageError = err.message;
      if (e is SqliteException && (e.resultCode == 11 || e.resultCode == 26)) readOnlyReason = kStorageFailed; // damaged file: stop writing
      if (e is SqliteException) throw err;
      rethrow;
    } finally {
      _depth--;
    }
  }

  static Exception _map(SqliteException e) {
    final code = e.resultCode;
    if (code == 13) return const StorageError(kStorageFull); // SQLITE_FULL
    if (code == 10 || code == 11 || code == 8 || code == 26) return const StorageError(kStorageFailed); // IOERR, CORRUPT, READONLY, NOTADB
    return AppError('The record was not saved (${e.message}).');
  }

  void _write(String op, String sql, List<Object?> args) {
    _check();
    if (_depth == 0) throw StateError('Writes happen inside tx() only');
    fault?.call(op);
    _db.execute(sql, args);
  }

  void insert(String table, Doc row) => _write('insert $table', 'INSERT INTO $table (id, doc) VALUES (?, ?)', [row['id'], jsonText(row)]);

  void put(String table, Doc row) => _write(
      'put $table', 'INSERT INTO $table (id, doc) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc', [row['id'], jsonText(row)]);

  void update(String table, String id, Doc changes) {
    final cur = get(table, id);
    if (cur == null) throw const AppError('The record was not found.');
    put(table, {...cur, ...changes});
  }

  void delete(String table, String id) => _write('delete $table', 'DELETE FROM $table WHERE id = ?', [id]);

  void insertPhoto(Doc row, Uint8List bytes) =>
      _write('insert m_photo', 'INSERT INTO m_photo (id, doc, bytes) VALUES (?, ?, ?)', [row['id'], jsonText(row), bytes]);

  Uint8List? photoBytes(String id) {
    _check();
    final r = _db.select('SELECT bytes FROM m_photo WHERE id = ?', [id]);
    return r.isEmpty ? null : r.first['bytes'] as Uint8List?;
  }

  Doc _row(Object? doc) => (jsonDecode(doc as String) as Map).cast<String, Object?>();

  Doc? get(String table, String id) {
    _check();
    final r = _db.select('SELECT doc FROM $table WHERE id = ?', [id]);
    return r.isEmpty ? null : _row(r.first['doc']);
  }

  List<Doc> all(String table) {
    _check();
    return [for (final r in _db.select('SELECT doc FROM $table ORDER BY rowid')) _row(r['doc'])];
  }

  /// Rows whose JSON [field] equals [value] (indexed for the fields in kIndexes).
  List<Doc> where(String table, String field, Object value) {
    _check();
    return [for (final r in _db.select("SELECT doc FROM $table WHERE json_extract(doc, '\$.$field') = ? ORDER BY rowid", [value])) _row(r['doc'])];
  }

  int count(String table) {
    _check();
    return _db.select('SELECT count(*) AS n FROM $table').first['n'] as int;
  }

  Doc? lastAudit() {
    _check();
    final r = _db.select("SELECT doc FROM audit_log ORDER BY json_extract(doc, '\$.seq') DESC LIMIT 1");
    return r.isEmpty ? null : _row(r.first['doc']);
  }

  int nextCounter(String deviceId) {
    final r = _db.select("SELECT max(json_extract(doc, '\$.counter')) AS n FROM entry WHERE json_extract(doc, '\$.device_id') = ?", [deviceId]);
    return ((r.first['n'] as int?) ?? 0) + 1;
  }

  String? meta(String key) => get('m_meta', key)?['value'] as String?;
  void setMeta(String key, String value) => put('m_meta', {'id': key, 'value': value});

  /// Size of the database in bytes (pages), as SQLite reports it.
  int sizeBytes() {
    _check();
    final pc = _db.select('PRAGMA page_count').first.values.first as int;
    final ps = _db.select('PRAGMA page_size').first.values.first as int;
    return pc * ps;
  }

  /// SQLite's own structure check ("ok" when nothing is wrong).
  String integrity() => '${_db.select('PRAGMA quick_check').first.values.first}';

  /// SQLCipher page authentication check; empty list = every page is authentic.
  List<String> cipherIntegrity() => [for (final r in _db.select('PRAGMA cipher_integrity_check')) '${r.values.first}'];
}
