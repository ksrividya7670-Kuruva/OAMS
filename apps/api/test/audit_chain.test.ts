import { describe, it, expect } from 'vitest';
import { canonicalJson, computeAuditHash } from '../src/core/audit/auditWriter.js';

describe('Audit Event SHA-256 Hash Chaining (§7.7, §17.3)', () => {
  it('should serialize JSON deterministically with sorted keys', () => {
    const objA = { z: 26, a: 1, m: { y: 25, b: 2 } };
    const objB = { a: 1, m: { b: 2, y: 25 }, z: 26 };

    const canonicalA = canonicalJson(objA);
    const canonicalB = canonicalJson(objB);

    expect(canonicalA).toBe('{"a":1,"m":{"b":2,"y":25},"z":26}');
    expect(canonicalA).toEqual(canonicalB);
  });

  it('should compute valid 64-character SHA-256 hashes', () => {
    const prevHash = '0'.repeat(64);
    const payload = {
      action: 'official.created',
      entityId: 'official-1',
      actorId: 'user-admin',
    };

    const hash = computeAuditHash(prevHash, payload);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should form an unbroken cryptographic chain and detect tampering', () => {
    const genesisHash = '0'.repeat(64);

    const event1 = {
      action: 'user.created',
      actorId: 'admin-1',
      entityId: 'user-1',
      occurredAt: '2026-09-23T10:00:00.000Z',
    };
    const hash1 = computeAuditHash(genesisHash, event1);

    const event2 = {
      action: 'official.created',
      actorId: 'admin-1',
      entityId: 'official-1',
      occurredAt: '2026-09-23T10:05:00.000Z',
    };
    const hash2 = computeAuditHash(hash1, event2);

    const event3 = {
      action: 'official.assigned_staff',
      actorId: 'admin-1',
      entityId: 'official-1',
      occurredAt: '2026-09-23T10:10:00.000Z',
    };
    const hash3 = computeAuditHash(hash2, event3);

    // Verify unbroken chain forwards
    expect(computeAuditHash(genesisHash, event1)).toBe(hash1);
    expect(computeAuditHash(hash1, event2)).toBe(hash2);
    expect(computeAuditHash(hash2, event3)).toBe(hash3);

    // Tamper with event 2 (e.g. attacker modifies actorId or changes)
    const tamperedEvent2 = { ...event2, actorId: 'attacker-id' };
    const tamperedHash2 = computeAuditHash(hash1, tamperedEvent2);

    // Tampering alters event 2's hash
    expect(tamperedHash2).not.toBe(hash2);

    // And breaks event 3's link
    const recomputedHash3WithTampered = computeAuditHash(tamperedHash2, event3);
    expect(recomputedHash3WithTampered).not.toBe(hash3);
  });
});
