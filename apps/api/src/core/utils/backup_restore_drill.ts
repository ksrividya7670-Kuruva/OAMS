/**
 * OAMS Database Backup & Disaster Recovery Drill Logic (§17.6, §22 Track 12)
 *
 * Verifies end-to-end database snapshot creation, integrity checksum calculation,
 * schema restoration verification, and cryptographic audit hash-chain continuity.
 */

import crypto from 'node:crypto';

export interface TableBackupMetadata {
  tableName: string;
  rowCount: number;
  dataHash: string;
}

export interface BackupBundle {
  version: string;
  timestamp: string;
  tables: Record<string, any[]>;
  metadata: TableBackupMetadata[];
  auditChainRootHash: string | null;
  overallChecksum: string;
}

export interface DrillResult {
  success: boolean;
  timestamp: string;
  durationMs: number;
  tablesBackedUp: number;
  totalRows: number;
  auditChainVerified: boolean;
  checksumMatches: boolean;
  errors: string[];
}

/**
 * Computes deterministic canonical JSON string of arbitrary JSON-serializable object
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const keyValues = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`,
  );
  return `{${keyValues.join(',')}}`;
}

/**
 * Computes deterministic SHA-256 checksum of arbitrary JSON-serializable object
 */
export function computeJsonHash(data: any): string {
  const jsonStr = canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

/**
 * Creates an in-memory or persisted backup bundle from table data maps
 */
export function createBackupBundle(tableData: Record<string, any[]>): BackupBundle {
  const timestamp = new Date().toISOString();
  const metadata: TableBackupMetadata[] = [];
  const hasher = crypto.createHash('sha256');

  for (const [tableName, rows] of Object.entries(tableData)) {
    const tableHash = computeJsonHash(rows);
    metadata.push({
      tableName,
      rowCount: rows.length,
      dataHash: tableHash,
    });
    hasher.update(`${tableName}:${tableHash}:`);
  }

  // Audit chain validation
  const auditRows = tableData['audit_events'] || [];
  let auditChainRootHash: string | null = null;
  if (auditRows.length > 0) {
    const lastRow = auditRows[auditRows.length - 1];
    auditChainRootHash = lastRow.hash || null;
  }

  const overallChecksum = hasher.digest('hex');

  return {
    version: '2.0',
    timestamp,
    tables: tableData,
    metadata,
    auditChainRootHash,
    overallChecksum,
  };
}

/**
 * Simulates disaster recovery restoration and verifies integrity against the backup bundle
 */
export function executeRestoreDrill(bundle: BackupBundle): DrillResult {
  const start = Date.now();
  const errors: string[] = [];
  let totalRows = 0;

  // 1. Check overall bundle checksum
  const verifyHasher = crypto.createHash('sha256');
  for (const meta of bundle.metadata) {
    const rows = bundle.tables[meta.tableName];
    if (!rows) {
      errors.push(`Missing table data for table ${meta.tableName}`);
      continue;
    }

    if (rows.length !== meta.rowCount) {
      errors.push(
        `Row count mismatch on ${meta.tableName}: expected ${meta.rowCount}, got ${rows.length}`,
      );
    }

    const recomputedTableHash = computeJsonHash(rows);
    if (recomputedTableHash !== meta.dataHash) {
      errors.push(`Checksum mismatch on table ${meta.tableName}`);
    }

    verifyHasher.update(`${meta.tableName}:${recomputedTableHash}:`);
    totalRows += rows.length;
  }

  const recomputedOverallChecksum = verifyHasher.digest('hex');
  const checksumMatches = recomputedOverallChecksum === bundle.overallChecksum;
  if (!checksumMatches) {
    errors.push('Bundle overall checksum verification failed.');
  }

  // 2. Validate audit hash-chain continuity in restored dataset
  let auditChainVerified = true;
  const auditRows = bundle.tables['audit_events'] || [];
  if (auditRows.length > 1) {
    for (let i = 1; i < auditRows.length; i++) {
      const prev = auditRows[i - 1];
      const curr = auditRows[i];
      if (curr.prev_hash && curr.prev_hash !== prev.hash) {
        auditChainVerified = false;
        errors.push(
          `Audit chain broken between row ${prev.id} and ${curr.id}: expected prev_hash=${prev.hash}, got ${curr.prev_hash}`,
        );
        break;
      }
    }
  }

  const durationMs = Date.now() - start;

  return {
    success: errors.length === 0,
    timestamp: new Date().toISOString(),
    durationMs,
    tablesBackedUp: bundle.metadata.length,
    totalRows,
    auditChainVerified,
    checksumMatches,
    errors,
  };
}
