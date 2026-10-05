export async function up(knex) {
  // 1. Organizations
  await knex.schema.createTable('organizations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.text('timezone').notNullable().defaultTo('Asia/Kolkata');
    t.jsonb('settings').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
  });
  // 2. Departments
  await knex.schema.createTable('departments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('name').notNullable();
    t.uuid('head_user_id').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
  });
  // 3. Users
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('email').notNullable();
    t.text('phone').nullable();
    t.text('full_name').notNullable();
    t.text('designation').nullable();
    t.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
    t.text('auth_provider').notNullable().defaultTo('LOCAL'); // MICROSOFT, EMAIL_OTP, LOCAL
    t.text('external_subject').nullable(); // Entra oid
    t.text('password_hash').nullable();
    t.text('totp_secret_enc').nullable();
    t.text('status').notNullable().defaultTo('ACTIVE'); // ACTIVE, DISABLED
    t.text('timezone').notNullable().defaultTo('Asia/Kolkata');
    t.text('theme').notNullable().defaultTo('SYSTEM'); // LIGHT, DARK, SYSTEM
    t.text('quiet_hours_start').nullable(); // e.g. "22:00"
    t.text('quiet_hours_end').nullable(); // e.g. "07:00"
    t.text('digest_mode').notNullable().defaultTo('OFF'); // OFF, DAILY
    t.timestamp('last_login_at', { useTz: true }).nullable();
    t.timestamp('deleted_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['org_id', 'email']);
  });
  // 4. Roles & Permissions
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('code').notNullable().unique(); // RoleCode
    t.text('name').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('code').notNullable().unique(); // e.g. "appointment.create"
    t.text('description').nullable();
  });
  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');
    t.text('scope').notNullable().defaultTo('ORG'); // OWN, ASSIGNED, ORG
    t.primary(['role_id', 'permission_id']);
  });
  await knex.schema.createTable('user_roles', (t) => {
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.primary(['user_id', 'role_id']);
  });
  // 5. Auth Tokens & OTP
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.uuid('family_id').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.text('user_agent').nullable();
    t.text('ip').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('email_otps', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('email').notNullable();
    t.text('code_hash').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('consumed_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('consents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('email').nullable();
    t.text('purpose').notNullable();
    t.text('notice_version').notNullable();
    t.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('withdrawn_at', { useTz: true }).nullable();
  });
  // 6. Officials & Support Staff
  await knex.schema.createTable('officials', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('title').notNullable(); // e.g. "CEO"
    t.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
    t.boolean('is_vip').notNullable().defaultTo(false);
    t.text('timezone').notNullable().defaultTo('Asia/Kolkata');
    t.integer('default_duration_min').notNullable().defaultTo(30);
    t.integer('buffer_before_min').notNullable().defaultTo(0);
    t.integer('buffer_after_min').notNullable().defaultTo(15);
    t.integer('min_notice_min').notNullable().defaultTo(120);
    t.integer('max_advance_days').notNullable().defaultTo(90);
    t.integer('slot_granularity_min').notNullable().defaultTo(15);
    t.text('booking_mode').notNullable().defaultTo('SHOW_SLOTS');
    t.text('approval_mode').notNullable().defaultTo('OFFICIAL_APPROVES_ALL');
    t.text('default_visibility').notNullable().defaultTo('INTERNAL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('deleted_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['org_id', 'user_id']);
  });
  await knex.schema.createTable('official_support_staff', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('support_role').notNullable().defaultTo('PA'); // PA, EA, OFFICE_ADMIN
    t.text('rank').notNullable().defaultTo('PRIMARY'); // PRIMARY, SECONDARY
    t.integer('routing_order').notNullable().defaultTo(1);
    t.boolean('can_approve').notNullable().defaultTo(false);
    t.boolean('can_view_confidential').notNullable().defaultTo(false);
    t.boolean('can_view_personal').notNullable().defaultTo(false);
    t.boolean('can_edit_personal').notNullable().defaultTo(false);
    t.boolean('can_manage_tasks').notNullable().defaultTo(true);
    t.timestamp('active_from', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('active_to', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['official_id', 'user_id']);
  });
  await knex.schema.createTable('delegations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.uuid('from_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('to_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('scope').notNullable().defaultTo('ALL'); // ALL, APPOINTMENTS, TASKS
    t.timestamp('starts_at', { useTz: true }).notNullable();
    t.timestamp('ends_at', { useTz: true }).notNullable();
    t.text('reason').nullable();
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
  });
  await knex.schema.createTable('capacity_policies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.integer('max_meetings_per_day').notNullable().defaultTo(8);
    t.integer('max_meeting_minutes_per_day').notNullable().defaultTo(360);
    t.integer('max_external_per_day').notNullable().defaultTo(4);
    t.integer('max_consecutive').notNullable().defaultTo(3);
    t.integer('min_break_after_consecutive_min').notNullable().defaultTo(15);
    t.text('on_exceed').notNullable().defaultTo('WARN'); // BLOCK, WARN, REQUIRE_APPROVAL
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
  });
  // 7. Calendars (ORG + PERSONAL per official)
  await knex.schema.createTable('calendars', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.text('type').notNullable(); // ORG, PERSONAL
    t.text('color').notNullable().defaultTo('#2563eb');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['official_id', 'type']);
  });
  // 8. Notifications
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('event_type').notNullable();
    t.text('title').notNullable();
    t.text('body').notNullable();
    t.text('link').notNullable().defaultTo('/app/dashboard');
    t.text('priority').notNullable().defaultTo('MEDIUM');
    t.text('entity_type').notNullable();
    t.uuid('entity_id').notNullable();
    t.text('dedupe_key').notNullable().unique();
    t.timestamp('read_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'read_at']);
    t.index(['user_id', 'created_at']);
  });
  await knex.schema.createTable('notification_deliveries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('notification_id')
      .notNullable()
      .references('id')
      .inTable('notifications')
      .onDelete('CASCADE');
    t.text('channel').notNullable(); // IN_APP, EMAIL, SMS
    t.text('status').notNullable().defaultTo('SENT'); // QUEUED, SENT, FAILED, SKIPPED
    t.integer('attempts').notNullable().defaultTo(1);
    t.text('provider_message_id').nullable();
    t.text('last_error').nullable();
    t.timestamp('sent_at', { useTz: true }).nullable();
  });
  await knex.schema.createTable('notification_preferences', (t) => {
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('event_type').notNullable();
    t.text('channel').notNullable(); // IN_APP, EMAIL, SMS
    t.boolean('enabled').notNullable().defaultTo(true);
    t.primary(['user_id', 'event_type', 'channel']);
  });
  await knex.schema.createTable('notification_templates', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('event_type').notNullable();
    t.text('channel').notNullable();
    t.integer('version').notNullable().defaultTo(1);
    t.text('subject').notNullable();
    t.text('body').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  // 9. Outbox & Audit
  await knex.schema.createTable('outbox_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('event_type').notNullable();
    t.text('aggregate_type').notNullable();
    t.uuid('aggregate_id').notNullable();
    t.jsonb('payload').notNullable();
    t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('dispatched_at', { useTz: true }).nullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.text('last_error').nullable();
    t.index(['dispatched_at', 'occurred_at']);
  });
  await knex.schema.createTable('audit_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('actor_role').nullable();
    t.text('action').notNullable();
    t.text('entity_type').notNullable();
    t.uuid('entity_id').notNullable();
    t.jsonb('changes').nullable();
    t.text('reason').nullable();
    t.text('ip').nullable();
    t.text('user_agent').nullable();
    t.text('correlation_id').notNullable();
    t.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text('prev_hash').notNullable();
    t.text('hash').notNullable();
    t.index(['entity_type', 'entity_id']);
    t.index(['actor_id']);
    t.index(['occurred_at']);
  });
  // 10. Reference Counters & Settings
  await knex.schema.createTable('reference_counters', (t) => {
    t.text('prefix').notNullable();
    t.integer('year').notNullable();
    t.integer('last_value').notNullable().defaultTo(0);
    t.primary(['prefix', 'year']);
  });
  await knex.schema.createTable('settings', (t) => {
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('key').notNullable();
    t.jsonb('value').notNullable();
    t.primary(['org_id', 'key']);
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('settings');
  await knex.schema.dropTableIfExists('reference_counters');
  await knex.schema.dropTableIfExists('audit_events');
  await knex.schema.dropTableIfExists('outbox_events');
  await knex.schema.dropTableIfExists('notification_templates');
  await knex.schema.dropTableIfExists('notification_preferences');
  await knex.schema.dropTableIfExists('notification_deliveries');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('calendars');
  await knex.schema.dropTableIfExists('capacity_policies');
  await knex.schema.dropTableIfExists('delegations');
  await knex.schema.dropTableIfExists('official_support_staff');
  await knex.schema.dropTableIfExists('officials');
  await knex.schema.dropTableIfExists('consents');
  await knex.schema.dropTableIfExists('email_otps');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('departments');
  await knex.schema.dropTableIfExists('organizations');
}
//# sourceMappingURL=20260923000001_foundation.js.map
