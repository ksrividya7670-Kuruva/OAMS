import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Alter calendars table for sync configuration & status (§8.4)
  const hasSyncEnabled = await knex.schema.hasColumn('calendars', 'sync_enabled');
  if (!hasSyncEnabled) {
    await knex.schema.alterTable('calendars', (t) => {
      t.boolean('sync_enabled').notNullable().defaultTo(false);
      t.text('sync_provider').notNullable().defaultTo('MICROSOFT_GRAPH');
      t.text('external_calendar_id').nullable();
      t.timestamp('last_synced_at', { useTz: true }).nullable();
      t.text('sync_status').notNullable().defaultTo('IDLE'); // IDLE, SYNCING, ERROR
      t.text('last_sync_error').nullable();
    });
  }

  // 2. Alter appointments table for Teams meeting & sync state (§8.4, §18)
  const hasOnlineMeetingId = await knex.schema.hasColumn('appointments', 'online_meeting_id');
  if (!hasOnlineMeetingId) {
    await knex.schema.alterTable('appointments', (t) => {
      t.text('online_meeting_id').nullable();
      t.text('calendar_sync_status').notNullable().defaultTo('NONE'); // NONE, PENDING, SYNCED, FAILED, MISMATCH
      t.text('calendar_sync_error').nullable();
      t.index(['calendar_sync_status']);
    });
  }

  // 3. Add dlt_template_id to notification_templates (§17.6)
  const hasDltTemplateId = await knex.schema.hasColumn('notification_templates', 'dlt_template_id');
  if (!hasDltTemplateId) {
    await knex.schema.alterTable('notification_templates', (t) => {
      t.text('dlt_template_id').nullable();
    });
  }

  // 4. Create calendar_sync_records table for two-way sync tracking (§8.4, §20)
  const hasSyncRecordsTable = await knex.schema.hasTable('calendar_sync_records');
  if (!hasSyncRecordsTable) {
    await knex.schema.createTable('calendar_sync_records', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
      t.uuid('calendar_id').nullable().references('id').inTable('calendars').onDelete('CASCADE');
      t.uuid('event_id').nullable();
      t.uuid('appointment_id')
        .nullable()
        .references('id')
        .inTable('appointments')
        .onDelete('CASCADE');
      t.text('direction').notNullable().defaultTo('EXPORT'); // EXPORT, IMPORT
      t.text('external_event_id').nullable();
      t.text('status').notNullable().defaultTo('PENDING'); // PENDING, SUCCESS, FAILED, MISMATCH
      t.jsonb('details').nullable();
      t.text('error_message').nullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.index(['org_id', 'status']);
      t.index(['official_id']);
      t.index(['appointment_id']);
      t.index(['external_event_id']);
    });
  }

  // 5. Seed default TRAI DLT compliant SMS templates (§17.6)
  const existingTemplates = await knex('notification_templates')
    .where('channel', 'SMS')
    .whereIn('event_type', ['AppointmentConfirmed', 'MeetingReminder', 'AuthOtp']);

  if (existingTemplates.length === 0) {
    await knex('notification_templates').insert([
      {
        event_type: 'AppointmentConfirmed',
        channel: 'SMS',
        version: 1,
        subject: 'Appointment Confirmed',
        body: 'Your appointment with {#var#} on {#var#} at {#var#} is confirmed. Ref: {#var#} - OAMS',
        dlt_template_id: 'DLT-TE-1001',
        is_active: true,
      },
      {
        event_type: 'MeetingReminder',
        channel: 'SMS',
        version: 1,
        subject: 'Meeting Reminder',
        body: 'Reminder: Your appointment with {#var#} is scheduled for {#var#}. Ref: {#var#} - OAMS',
        dlt_template_id: 'DLT-TE-1002',
        is_active: true,
      },
      {
        event_type: 'AuthOtp',
        channel: 'SMS',
        version: 1,
        subject: 'Authentication OTP',
        body: '{#var#} is your verification code for OAMS login. Valid for 10 minutes. Do not share. - OAMS',
        dlt_template_id: 'DLT-TE-1003',
        is_active: true,
      },
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('notification_templates')
    .where('channel', 'SMS')
    .whereIn('dlt_template_id', ['DLT-TE-1001', 'DLT-TE-1002', 'DLT-TE-1003'])
    .delete();

  await knex.schema.dropTableIfExists('calendar_sync_records');

  const hasDltTemplateId = await knex.schema.hasColumn('notification_templates', 'dlt_template_id');
  if (hasDltTemplateId) {
    await knex.schema.alterTable('notification_templates', (t) => {
      t.dropColumn('dlt_template_id');
    });
  }

  const hasOnlineMeetingId = await knex.schema.hasColumn('appointments', 'online_meeting_id');
  if (hasOnlineMeetingId) {
    await knex.schema.alterTable('appointments', (t) => {
      t.dropColumn('online_meeting_id');
      t.dropColumn('calendar_sync_status');
      t.dropColumn('calendar_sync_error');
    });
  }

  const hasSyncEnabled = await knex.schema.hasColumn('calendars', 'sync_enabled');
  if (hasSyncEnabled) {
    await knex.schema.alterTable('calendars', (t) => {
      t.dropColumn('sync_enabled');
      t.dropColumn('sync_provider');
      t.dropColumn('external_calendar_id');
      t.dropColumn('last_synced_at');
      t.dropColumn('sync_status');
      t.dropColumn('last_sync_error');
    });
  }
}
