# Operational Runbook: Database Backup, Disaster Recovery & Restore Drill

**System:** Official Appointment Management System (OAMS v2)  
**Database:** PostgreSQL 16 LTS  
**Target SLAs:**

- **RTO (Recovery Time Objective):** < 1 Hour
- **RPO (Recovery Point Objective):** < 15 Minutes  
  **Revision:** 2.0 (September 2026)

---

## 1. Backup Strategy & Architecture

To achieve an RPO of < 15 minutes and satisfy statutory compliance (§17.6, CERT-In, DPDP Act 2023), OAMS utilizes a two-tier backup architecture:

```text
[ PostgreSQL Primary ]
      │
      ├── (Nightly 02:00 IST) ──▶ Full pg_dump Snapshot ──▶ Encrypted S3 / Azure WORM Vault (GCM-256)
      │
      └── (Continuous <15m)   ──▶ WAL Streaming (archive_command) ──▶ Point-in-Time Recovery (PITR) Log Storage
```

### Backup Schedule & Retention Policy

| Backup Type                 | Frequency                   | Storage Location           | Retention Period                      | Encryption                |
| --------------------------- | --------------------------- | -------------------------- | ------------------------------------- | ------------------------- |
| **Full Database Dump**      | Daily at 02:00 IST          | Cloud Vault (India Region) | 30 Days daily; 7 Years yearly (§17.6) | AES-256 (KMS-managed key) |
| **Continuous WAL Logs**     | Every 15 min / on 16MB fill | Dedicated Archive Bucket   | 14 Days rolling window                | AES-256                   |
| **Configuration & Secrets** | On change / weekly          | Encrypted Secrets Manager  | Version history retained              | AES-256                   |

---

## 2. Automated Daily Backup Execution

Automated backups are executed by cron/worker using the following command:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DATE=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_DIR="/var/backups/oams"
DUMP_FILE="${BACKUP_DIR}/oams_full_${BACKUP_DATE}.dump"
CHECKSUM_FILE="${DUMP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

# 1. Take compressed custom-format pg_dump
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -F c \
  -b \
  -v \
  -f "${DUMP_FILE}"

# 2. Compute SHA-256 Checksum
sha256sum "${DUMP_FILE}" > "${CHECKSUM_FILE}"

# 3. Upload to immutable cloud storage vault
aws s3 cp "${DUMP_FILE}" "s3://oams-db-backups-india/daily/${BACKUP_DATE}/" --sse aws:kms
aws s3 cp "${CHECKSUM_FILE}" "s3://oams-db-backups-india/daily/${BACKUP_DATE}/" --sse aws:kms

echo "[SUCCESS] Backup ${DUMP_FILE} completed and synced to cloud storage."
```

---

## 3. Disaster Recovery Restoration Procedure (Step-by-Step)

In the event of database failure, data corruption, or hardware catastrophe:

### Step 1: Provision Clean PostgreSQL Target

1. Ensure target PostgreSQL 16 instance is running with matching collation (`en_US.UTF-8` or `en_IN`).
2. Verify network security groups allow access only from the OAMS backend private subnet.

### Step 2: Retrieve & Verify Backup Artifacts

1. Download the latest verified backup bundle and checksum file from the secure vault:
   ```bash
   aws s3 cp "s3://oams-db-backups-india/daily/<SNAPSHOT_ID>/oams_full.dump" /tmp/
   aws s3 cp "s3://oams-db-backups-india/daily/<SNAPSHOT_ID>/oams_full.dump.sha256" /tmp/
   ```
2. Verify integrity:
   ```bash
   cd /tmp && sha256sum -c oams_full.dump.sha256
   ```
   **DO NOT PROCEED** if checksum verification fails.

### Step 3: Execute Restoration

1. Re-create clean database target:
   ```bash
   dropdb -h ${DB_HOST} -U ${DB_USER} --if-exists oams_prod
   createdb -h ${DB_HOST} -U ${DB_USER} -O oams_owner oams_prod
   ```
2. Restore database objects and data:
   ```bash
   pg_restore -h ${DB_HOST} -U ${DB_USER} -d oams_prod -v --single-transaction /tmp/oams_full.dump
   ```
3. If replaying WAL archives for Point-In-Time Recovery (PITR):
   - Configure `recovery.signal` and `restore_command`.
   - Set `recovery_target_time = '2026-09-24 14:30:00+05:30'`.
   - Start PostgreSQL service to replay WAL logs to the exact minute of failure.

---

## 4. Post-Restoration Verification Checklist

Before opening traffic to users, execute the verification checklist:

- [ ] **Database Connectivity:** Able to execute `SELECT 1;` from API pods.
- [ ] **Schema Version:** Verify latest migration executed (`knex_migrations` matches repository head).
- [ ] **Row Count Auditing:** Compare core table row counts against pre-disaster metrics:
  - `users`, `officials`, `calendars`, `appointments`, `visits`, `tasks`.
- [ ] **Cryptographic Hash Chain Continuity:**
      Run the automated verification job:
  ```bash
  pnpm --filter @oams/api test test/audit_hash_chain.test.ts
  ```
  Ensure all `audit_events` hashes chain continuously without any broken links.
- [ ] **Exclusion Constraints Active:** Verify `bdr_no_overlap` constraint on `calendar_events` is intact.
- [ ] **Access Permissions Intact:** Verify DB application user only has INSERT/SELECT permissions on `audit_events`.

---

## 5. Annual Disaster Recovery Drill Protocol

Per §22 Track 12, disaster recovery drills must be performed periodically to ensure operational readiness:

1. **Drill Cadence:** Minimum once every 6 months in staging/DR sandbox.
2. **Automated Drill Validation:**
   Run the OAMS automated drill runner:
   ```bash
   pnpm tsx scripts/backup_restore_drill.ts
   ```
3. **Drill Metrics Captured:**
   - Total restore duration (must be < 60 minutes).
   - Recovery point achieved (data loss must be < 15 minutes).
   - Checksum matches and audit chain continuity confirmed.
4. **Sign-off:** Security Lead and Infrastructure Lead sign off on the DR drill report.
