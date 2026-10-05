# Operational Runbook: Cryptographic Key Rotation & Secret Management

**System:** Official Appointment Management System (OAMS v2)  
**Standard:** OWASP ASVS Level 2 (§17.1, §22 Track 12)  
**Scope:** RS256 JWT Signing Keys, Refresh Token Secrets, Cookie Signing Secrets, Data-at-Rest Encryption Keys  
**Revision:** 2.0 (September 2026)

---

## 1. Overview & Rotation Frequency

OAMS utilizes cryptographic keys for authentication, session integrity, audit hashing, and data encryption. To mitigate risks of key compromise and satisfy security compliance standards, all keys follow a strict rotation lifecycle.

| Secret / Key                | Algorithm                    | Purpose                           | Rotation Cadence  | Zero-Downtime Method                                      |
| --------------------------- | ---------------------------- | --------------------------------- | ----------------- | --------------------------------------------------------- |
| **Access Token Key Pair**   | RSA 2048 / 4096 (RS256)      | Signs 15-minute access JWTs       | Every 90 Days     | `kid` (Key ID) header in JWT with dual-public-key overlap |
| **Refresh Token Secret**    | HMAC-SHA256 (256-bit random) | Hashes rotating refresh tokens    | Every 180 Days    | Dual-secret acceptance window (Current + Previous)        |
| **Cookie Signing Secret**   | 256-bit random string        | Signs HTTP-only session cookies   | Every 180 Days    | Key array in CookieParser (`[currentSecret, oldSecret]`)  |
| **Document Encryption Key** | AES-256-GCM                  | Encrypts visitor ID scans at rest | Annual (365 Days) | Re-encrypt on read / background re-encryption worker      |

---

## 2. Zero-Downtime RS256 JWT Key Pair Rotation Protocol

OAMS JWT tokens include a `kid` header pointing to the specific public key used to verify the signature. This allows rotating signing keys without terminating user sessions or forcing users to re-login.

### Phase 1: Generate New RSA Key Pair (Day 0)

Generate a new 2048-bit RSA key pair with a unique timestamped `kid`:

```bash
# Generate private key
openssl genpkey -algorithm RSA -out jwt_private_2026q4.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key
openssl rsa -pubout -in jwt_private_2026q4.pem -out jwt_public_2026q4.pem
```

### Phase 2: Deploy Public Keys Overlap (Day 1)

1. Add the **new public key** to the OAMS public key ring:
   ```json
   {
     "keys": [
       { "kid": "key-2026-q3", "publicKey": "..." },
       { "kid": "key-2026-q4", "publicKey": "..." }
     ]
   }
   ```
2. Deploy backend instances. At this stage:
   - Tokens signed with the old key (`key-2026-q3`) continue to verify successfully.
   - Any new token signed with `key-2026-q4` can also be verified.

### Phase 3: Switch Active Signing Key (Day 2)

1. Update environment variable `JWT_PRIVATE_KEY` on all API instances to point to `jwt_private_2026q4.pem`, with `JWT_KID=key-2026-q4`.
2. Reload backend instances gracefully.
3. Newly issued 15-minute access tokens will now be signed with `key-2026-q4`.
4. Existing access tokens signed with `key-2026-q3` will expire naturally within 15 minutes.

### Phase 4: Retire Old Public Key (Day 3)

1. Wait at least 24 hours (well past the 15-minute access token lifespan).
2. Remove the retired `key-2026-q3` from the public key ring.
3. Securely archive or shred the retired private key.

---

## 3. Refresh Token & Session Secret Rotation

Refresh tokens are stored in the database hashed with SHA-256 and scoped to `httpOnly; Secure; SameSite=Strict` cookies.

When rotating the refresh token signing secret:

1. Provide both current and previous secrets in configuration:
   ```env
   REFRESH_TOKEN_SECRETS="secret_2026_q4,secret_2026_q3"
   ```
2. The verification logic checks against `secret_2026_q4` first; if invalid, falls back to `secret_2026_q3`.
3. When tokens are refreshed via `/api/v1/auth/refresh`, new tokens are issued using `secret_2026_q4`.
4. After 7 days (the maximum refresh token lifespan), `secret_2026_q3` is removed.

---

## 4. Emergency Key Revocation Protocol

In the event of suspected key compromise or unauthorized access:

1. **Immediate Revocation:**
   - Execute emergency user token invalidation by incrementing `token_version` on all affected user records:
     ```sql
     UPDATE users SET token_version = token_version + 1;
     ```
   - All outstanding access tokens (even if cryptographically valid) will immediately fail authorization in `requireAuth` middleware (§17.1).
2. **Revoke Active Refresh Tokens:**
   ```sql
   UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
3. **Emergency Key Rollover:**
   - Follow Phase 1–3 immediately to generate and deploy new RSA signing keys.
4. **Initiate Incident Reporting:**
   - Check [incident_cert_in_reporting.md](file:///c:/Users/user/OneDrive/Desktop/OAMS/docs/runbooks/incident_cert_in_reporting.md) and report to CERT-In within 6 hours.
