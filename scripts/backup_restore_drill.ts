/**
 * OAMS Database Backup & Disaster Recovery Drill Script (§17.6, §22 Track 12)
 *
 * Verifies end-to-end database snapshot creation, integrity checksum calculation,
 * schema restoration verification, and cryptographic audit hash-chain continuity.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBackupBundle,
  executeRestoreDrill,
  type TableBackupMetadata,
  type BackupBundle,
  type DrillResult,
  canonicalJsonStringify,
  computeJsonHash,
} from '../apps/api/src/core/utils/backup_restore_drill.js';

export {
  createBackupBundle,
  executeRestoreDrill,
  type TableBackupMetadata,
  type BackupBundle,
  type DrillResult,
  canonicalJsonStringify,
  computeJsonHash,
};

// Standalone execution entrypoint
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  console.log('=== OAMS Backup & Disaster Recovery Drill ===');
  const mockSampleData = {
    users: [
      { id: 'u1', email: 'director@example.gov.in', status: 'ACTIVE' },
      { id: 'u2', email: 'pa@example.gov.in', status: 'ACTIVE' },
    ],
    appointments: [{ id: 'apt-1', reference_no: 'APT-2026-000001', status: 'CONFIRMED' }],
    audit_events: [
      { id: 'aud-1', prev_hash: null, hash: 'hash1', action: 'APPOINTMENT_SUBMIT' },
      { id: 'aud-2', prev_hash: 'hash1', hash: 'hash2', action: 'APPOINTMENT_CONFIRM' },
    ],
  };

  const bundle = createBackupBundle(mockSampleData);
  const result = executeRestoreDrill(bundle);

  console.log(`Tables Backed Up: ${result.tablesBackedUp}`);
  console.log(`Total Rows: ${result.totalRows}`);
  console.log(`Audit Chain Verified: ${result.auditChainVerified}`);
  console.log(`Checksum Validated: ${result.checksumMatches}`);
  console.log(`Drill Status: ${result.success ? 'PASSED' : 'FAILED'}`);
  process.exit(result.success ? 0 : 1);
}
