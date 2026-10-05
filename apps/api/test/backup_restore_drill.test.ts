import { describe, it, expect } from 'vitest';
import {
  createBackupBundle,
  executeRestoreDrill,
  computeJsonHash,
} from '../src/core/utils/backup_restore_drill.js';

describe('Database Backup & Disaster Recovery Drill (§17.6, §22 Track 12)', () => {
  const sampleDatabase = {
    users: [
      { id: 'u1', email: 'chairman@example.gov.in', status: 'ACTIVE' },
      { id: 'u2', email: 'director@example.gov.in', status: 'ACTIVE' },
      { id: 'u3', email: 'ea@example.gov.in', status: 'ACTIVE' },
    ],
    officials: [
      { id: 'off-1', user_id: 'u1', title: 'Chairman', is_active: true },
      { id: 'off-2', user_id: 'u2', title: 'Director', is_active: true },
    ],
    appointments: [
      {
        id: 'apt-1',
        reference_no: 'APT-2026-000001',
        official_id: 'off-1',
        status: 'CONFIRMED',
        priority: 'HIGH',
      },
    ],
    audit_events: [
      { id: 'aud-1', prev_hash: null, hash: 'h100', action: 'OFFICIAL_CREATE' },
      { id: 'aud-2', prev_hash: 'h100', hash: 'h200', action: 'APPOINTMENT_REQUEST' },
      { id: 'aud-3', prev_hash: 'h200', hash: 'h300', action: 'APPOINTMENT_CONFIRM' },
    ],
  };

  it('creates a verified backup bundle with table metadata and overall checksum', () => {
    const bundle = createBackupBundle(sampleDatabase);

    expect(bundle.version).toBe('2.0');
    expect(bundle.timestamp).toBeDefined();
    expect(bundle.metadata).toHaveLength(4);
    expect(bundle.overallChecksum).toBeDefined();
    expect(bundle.auditChainRootHash).toBe('h300');

    const usersMeta = bundle.metadata.find((m) => m.tableName === 'users');
    expect(usersMeta?.rowCount).toBe(3);
    expect(usersMeta?.dataHash).toBe(computeJsonHash(sampleDatabase.users));
  });

  it('successfully executes disaster recovery restore drill on uncorrupted backup', () => {
    const bundle = createBackupBundle(sampleDatabase);
    const result = executeRestoreDrill(bundle);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.tablesBackedUp).toBe(4);
    expect(result.totalRows).toBe(9);
    expect(result.checksumMatches).toBe(true);
    expect(result.auditChainVerified).toBe(true);
  });

  it('detects tampering or corruption in restored table data', () => {
    const bundle = createBackupBundle(sampleDatabase);

    // Tamper with appointment record
    bundle.tables['appointments'][0].status = 'CANCELLED';

    const result = executeRestoreDrill(bundle);

    expect(result.success).toBe(false);
    expect(result.checksumMatches).toBe(false);
    expect(result.errors.some((e) => e.includes('Checksum mismatch on table appointments'))).toBe(
      true,
    );
  });

  it('detects broken audit hash chain during restore drill', () => {
    const brokenDatabase = {
      ...sampleDatabase,
      audit_events: [
        { id: 'aud-1', prev_hash: null, hash: 'h100', action: 'OFFICIAL_CREATE' },
        { id: 'aud-2', prev_hash: 'TAMPERED_HASH', hash: 'h200', action: 'APPOINTMENT_REQUEST' },
      ],
    };

    const bundle = createBackupBundle(brokenDatabase);
    const result = executeRestoreDrill(bundle);

    expect(result.success).toBe(false);
    expect(result.auditChainVerified).toBe(false);
    expect(result.errors.some((e) => e.includes('Audit chain broken'))).toBe(true);
  });
});
