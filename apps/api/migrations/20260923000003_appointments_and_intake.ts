import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Consents table (§7.1, §17.6)
  await knex.schema.createTable('consents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('email').nullable();
    t.text('purpose').notNullable();
    t.text('notice_version').notNullable();
    t.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('withdrawn_at', { useTz: true }).nullable();

    t.index(['user_id']);
    t.index(['email']);
  });

  // 2. Appointments table (§7.5)
  await knex.schema.createTable('appointments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('reference_no').notNullable().unique();
    t.uuid('requester_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('requester_type').notNullable().defaultTo('VISITOR'); // EMPLOYEE, CUSTOMER, VENDOR, PARTNER, GOVERNMENT, VISITOR, OTHER
    t.jsonb('requester_snapshot').notNullable();
    t.uuid('primary_official_id')
      .notNullable()
      .references('id')
      .inTable('officials')
      .onDelete('CASCADE');
    t.text('subject').notNullable();
    t.text('purpose').notNullable();
    t.text('description').notNullable();
    t.text('priority').notNullable().defaultTo('MEDIUM'); // LOW, MEDIUM, HIGH, URGENT
    t.text('priority_reason').nullable();
    t.text('meeting_mode').notNullable().defaultTo('IN_PERSON'); // IN_PERSON, ONLINE, PHONE
    t.text('visibility').notNullable().defaultTo('INTERNAL'); // PUBLIC, INTERNAL, CONFIDENTIAL
    t.integer('duration_min').notNullable().defaultTo(30);
    t.integer('attendee_count').notNullable().defaultTo(1);
    t.jsonb('preferred_windows').notNullable().defaultTo('[]');
    t.timestamp('start_at', { useTz: true }).nullable();
    t.timestamp('end_at', { useTz: true }).nullable();
    t.text('timezone').notNullable().defaultTo('Asia/Kolkata');
    t.uuid('room_id').nullable().references('id').inTable('rooms').onDelete('SET NULL');
    t.text('online_link').nullable();
    t.text('status').notNullable().defaultTo('DRAFT');
    t.timestamp('status_changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('assigned_to_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('sla_due_at', { useTz: true }).nullable();
    t.integer('escalation_level').notNullable().defaultTo(0);
    t.text('info_request_note').nullable();
    t.text('cancel_reason').nullable();
    t.text('cancel_note').nullable();
    t.timestamp('submitted_at', { useTz: true }).nullable();
    t.timestamp('confirmed_at', { useTz: true }).nullable();
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.timestamp('closed_at', { useTz: true }).nullable();
    t.boolean('consent_given').notNullable().defaultTo(false);
    t.text('consent_notice_version').nullable();

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);

    t.index(['org_id']);
    t.index(['primary_official_id']);
    t.index(['requester_user_id']);
    t.index(['status']);
    t.index(['sla_due_at']);
    t.index(['submitted_at']);
  });

  // 3. Appointment Officials table (§7.5)
  await knex.schema.createTable('appointment_officials', (t) => {
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.text('requirement').notNullable().defaultTo('REQUIRED'); // REQUIRED, OPTIONAL
    t.text('decision').notNullable().defaultTo('PENDING'); // PENDING, APPROVED, REJECTED
    t.uuid('decided_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('decided_at', { useTz: true }).nullable();
    t.text('decision_note').nullable();

    t.primary(['appointment_id', 'official_id']);
  });

  // 4. Appointment Attendees table (§7.5)
  await knex.schema.createTable('appointment_attendees', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('email').nullable();
    t.text('phone').nullable();
    t.text('organization').nullable();
    t.boolean('is_external').notNullable().defaultTo(false);
    t.text('needs').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['appointment_id']);
  });

  // 5. Appointment Status History table (§7.5, §10.2)
  await knex.schema.createTable('appointment_status_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.text('from_status').nullable();
    t.text('to_status').notNullable();
    t.text('action').notNullable();
    t.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('note').nullable();
    t.timestamp('at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['appointment_id']);
    t.index(['at']);
  });

  // 6. Attachments table (§7.5)
  await knex.schema.createTable('attachments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('owner_type').notNullable(); // APPOINTMENT, TASK, NOTE
    t.uuid('owner_id').notNullable();
    t.text('file_name').notNullable();
    t.text('mime').notNullable();
    t.integer('size_bytes').notNullable();
    t.text('storage_key').notNullable();
    t.text('sha256').notNullable();
    t.text('scan_status').notNullable().defaultTo('CLEAN'); // PENDING, CLEAN, INFECTED, SKIPPED
    t.uuid('uploaded_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['owner_type', 'owner_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('attachments');
  await knex.schema.dropTableIfExists('appointment_status_history');
  await knex.schema.dropTableIfExists('appointment_attendees');
  await knex.schema.dropTableIfExists('appointment_officials');
  await knex.schema.dropTableIfExists('appointments');
  await knex.schema.dropTableIfExists('consents');
}
