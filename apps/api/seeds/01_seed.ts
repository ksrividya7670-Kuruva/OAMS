import type { Knex } from 'knex';
import bcrypt from 'bcrypt';
import { RoleCode, Permission, CalendarType, DEFAULT_ROLE_PERMISSIONS } from '@oams/shared';

export async function seed(knex: Knex): Promise<void> {
  // Clear existing records in reverse dependency order
  await knex('notification_deliveries').del();
  await knex('notifications').del();
  await knex('audit_events').del();
  await knex('outbox_events').del();
  await knex('calendars').del();
  await knex('capacity_policies').del();
  await knex('official_support_staff').del();
  await knex('officials').del();
  await knex('user_roles').del();
  await knex('role_permissions').del();
  await knex('permissions').del();
  await knex('roles').del();
  await knex('users').del();
  await knex('departments').del();
  await knex('organizations').del();

  // 1. Create Organization
  const [org] = await knex('organizations')
    .insert({
      name: 'Apex Corporation',
      timezone: 'Asia/Kolkata',
      settings: JSON.stringify({ sso_allowed_domains: ['apex.local'] }),
    })
    .returning('*');

  // 2. Create Roles
  const roleEntries = Object.values(RoleCode).map((code) => ({
    code,
    name: code.replace(/_/g, ' '),
  }));

  const roles = await knex('roles').insert(roleEntries).returning('*');
  const roleMap = new Map(roles.map((r) => [r.code, r.id]));

  // 3. Create Permissions
  const permEntries = Object.values(Permission).map((code) => ({
    code,
    description: `Grants ${code}`,
  }));

  const perms = await knex('permissions').insert(permEntries).returning('*');
  const permMap = new Map(perms.map((p) => [p.code, p.id]));

  // 4. Create Role-Permissions
  const rolePermInserts: any[] = [];
  for (const [roleCode, mappings] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleId = roleMap.get(roleCode);
    if (!roleId) continue;

    for (const m of mappings) {
      const permId = permMap.get(m.permission);
      if (permId) {
        rolePermInserts.push({
          role_id: roleId,
          permission_id: permId,
          scope: m.scope,
        });
      }
    }
  }

  if (rolePermInserts.length > 0) {
    await knex('role_permissions').insert(rolePermInserts);
  }

  // 5. Create Departments
  const [executiveDept] = await knex('departments')
    .insert({
      org_id: org.id,
      name: 'Executive Office',
    })
    .returning('*');

  const [financeDept] = await knex('departments')
    .insert({
      org_id: org.id,
      name: 'Finance & Accounts',
    })
    .returning('*');

  const [operationsDept] = await knex('departments')
    .insert({
      org_id: org.id,
      name: 'Operations',
    })
    .returning('*');

  // 6. Common password hash for test accounts (cost 12 per §3.1)
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Helper to create user + assign roles
  async function createUser(
    email: string,
    fullName: string,
    designation: string,
    deptId: string,
    roleCodes: RoleCode[],
  ) {
    const [u] = await knex('users')
      .insert({
        org_id: org.id,
        email,
        full_name: fullName,
        designation,
        department_id: deptId,
        password_hash: passwordHash,
        auth_provider: 'LOCAL',
        status: 'ACTIVE',
      })
      .returning('*');

    const userRoles = roleCodes.map((rc) => ({
      user_id: u.id,
      role_id: roleMap.get(rc)!,
    }));
    await knex('user_roles').insert(userRoles);
    return u;
  }

  // 7. Create Users & Officials
  const _adminUser = await createUser(
    'admin@stmarysgroup.com',
    'System Admin',
    'IT Super Admin',
    executiveDept.id,
    [RoleCode.SUPER_ADMIN],
  );
  const kvkUser = await createUser(
    'kvk@stmarysgroup.com',
    'Mr. KVK',
    'Official',
    executiveDept.id,
    [RoleCode.OFFICIAL],
  );
  const ceoUser = await createUser(
    'harsha@stmarysgroup.com',
    'Mr. Harsha Rao',
    'Chief Executive Officer',
    executiveDept.id,
    [RoleCode.OFFICIAL],
  );
  const vcUser = await createUser(
    'vc@stmarysgroup.com',
    'Prof. Vice Chancellor',
    'Vice Chancellor',
    executiveDept.id,
    [RoleCode.OFFICIAL],
  );
  const bharathiUser = await createUser(
    'bharathi@stmarysgroup.com',
    'Ms. Bharathi',
    'President',
    executiveDept.id,
    [RoleCode.OFFICIAL],
  );
  const indhuUser = await createUser(
    'indhu@stmarysgroup.com',
    'Ms. Indhu',
    'Joint Secretary',
    executiveDept.id,
    [RoleCode.OFFICIAL, RoleCode.PA],
  );
  const janardhanUser = await createUser(
    'janardhan@stmarysgroup.com',
    'Mr. Janardhan',
    'Vice Principal / Admin',
    executiveDept.id,
    [RoleCode.OFFICIAL, RoleCode.PA],
  );

  await createUser('reception@stmarysgroup.com', 'Reception Desk', 'Front Desk Officer', executiveDept.id, [
    RoleCode.RECEPTION,
  ]);
  await createUser('security@stmarysgroup.com', 'Security Gate 1', 'Security Supervisor', executiveDept.id, [
    RoleCode.SECURITY,
  ]);
  await createUser(
    'auditor@stmarysgroup.com',
    'Kavita Menon',
    'Internal Compliance Auditor',
    executiveDept.id,
    [RoleCode.AUDITOR],
  );

  // 8. Create Officials & their Dual Calendars (ORG + PERSONAL per §8.1)
  async function createOfficial(userId: string, title: string, deptId: string, isVip: boolean) {
    const [off] = await knex('officials')
      .insert({
        org_id: org.id,
        user_id: userId,
        title,
        department_id: deptId,
        is_vip: isVip,
        default_duration_min: 30,
        buffer_before_min: 0,
        buffer_after_min: 15,
        min_notice_min: 120,
        max_advance_days: 90,
        slot_granularity_min: 15,
        booking_mode: 'SHOW_SLOTS',
        approval_mode: 'OFFICIAL_APPROVES_ALL',
        default_visibility: 'INTERNAL',
        is_active: true,
      })
      .returning('*');

    await knex('calendars').insert([
      { official_id: off.id, type: CalendarType.ORG, color: '#2563eb' },
      { official_id: off.id, type: CalendarType.PERSONAL, color: '#7c3aed' },
    ]);

    await knex('capacity_policies').insert({
      official_id: off.id,
      max_appointments_per_day: 8,
      max_duration_minutes_per_day: 360,
      max_consecutive_meetings: 3,
      min_break_minutes: 15,
      on_exceed: 'WARN',
    });

    // Seed default availability rules Mon-Fri 09:30-17:30
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({
      official_id: off.id,
      weekday,
      start_local: '09:30',
      end_local: '17:30',
      effective_from: '2026-01-01',
    }));
    await knex('availability_rules').insert(rules);

    return off;
  }

  const kvkOfficial = await createOfficial(kvkUser.id, 'Official', executiveDept.id, true);
  const ceoOfficial = await createOfficial(ceoUser.id, 'Chief Executive Officer', executiveDept.id, true);
  const vcOfficial = await createOfficial(vcUser.id, 'Vice Chancellor', executiveDept.id, true);
  const bharathiOfficial = await createOfficial(bharathiUser.id, 'President', executiveDept.id, true);
  const indhuOfficial = await createOfficial(indhuUser.id, 'Joint Secretary', executiveDept.id, false);
  const janardhanOfficial = await createOfficial(janardhanUser.id, 'Vice Principal / Admin', executiveDept.id, false);

  // 9. Assign Support Staff
  await knex('official_support_staff').insert([
    {
      official_id: kvkOfficial.id,
      user_id: indhuUser.id,
      support_role: 'PA',
      rank: 'PRIMARY',
      routing_order: 1,
      can_approve: true,
      can_view_confidential: true,
      can_view_personal: true,
      can_edit_personal: true,
      can_manage_tasks: true,
    },
    {
      official_id: ceoOfficial.id,
      user_id: indhuUser.id,
      support_role: 'PA',
      rank: 'PRIMARY',
      routing_order: 1,
      can_approve: true,
      can_view_confidential: true,
      can_view_personal: true,
      can_edit_personal: true,
      can_manage_tasks: true,
    },
    {
      official_id: vcOfficial.id,
      user_id: janardhanUser.id,
      support_role: 'PA',
      rank: 'PRIMARY',
      routing_order: 1,
      can_approve: false,
      can_view_confidential: false,
      can_view_personal: false,
      can_edit_personal: false,
      can_manage_tasks: true,
    },
  ]);

  // 10. Seed Rooms (§7.4)
  await knex('rooms').insert([
    {
      org_id: org.id,
      name: 'Executive Boardroom',
      building: 'Tower A',
      floor: '10',
      capacity: 20,
      equipment: JSON.stringify(['Projector', 'Video Conference', 'Whiteboard', 'Microphone']),
      is_active: true,
      setup_min: 15,
      cleanup_min: 15,
    },
    {
      org_id: org.id,
      name: 'Meeting Room Alpha',
      building: 'Tower A',
      floor: '9',
      capacity: 8,
      equipment: JSON.stringify(['TV Display', 'Whiteboard']),
      is_active: true,
      setup_min: 5,
      cleanup_min: 5,
    },
    {
      org_id: org.id,
      name: 'Meeting Room Beta',
      building: 'Tower A',
      floor: '9',
      capacity: 6,
      equipment: JSON.stringify(['TV Display']),
      is_active: true,
      setup_min: 5,
      cleanup_min: 5,
    },
  ]);

  // 11. Seed National Holidays (§7.3)
  await knex('holidays').insert([
    { org_id: org.id, date: '2026-01-26', name: 'Republic Day', is_optional: false },
    { org_id: org.id, date: '2026-08-15', name: 'Independence Day', is_optional: false },
    { org_id: org.id, date: '2026-10-02', name: 'Gandhi Jayanti', is_optional: false },
    { org_id: org.id, date: '2026-11-08', name: 'Diwali', is_optional: false },
    { org_id: org.id, date: '2026-12-25', name: 'Christmas', is_optional: false },
  ]);
}
