import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Appointment Proposals table (§7.5, §10.2, §10.7)
  await knex.schema.createTable('appointment_proposals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.uuid('change_request_id').nullable(); // For Track 5 change requests
    t.timestamp('start_at', { useTz: true }).notNullable();
    t.timestamp('end_at', { useTz: true }).notNullable();
    t.uuid('room_id').nullable().references('id').inTable('rooms').onDelete('SET NULL');
    t.uuid('hold_event_id')
      .nullable()
      .references('id')
      .inTable('calendar_events')
      .onDelete('SET NULL');
    t.uuid('proposed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.boolean('chosen').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['appointment_id']);
    t.index(['expires_at']);
    t.index(['hold_event_id']);
  });

  // 2. Add SLA pause tracking and reminder flag to appointments table (§10.2, §14.4)
  await knex.schema.alterTable('appointments', (t) => {
    t.timestamp('sla_paused_at', { useTz: true }).nullable();
    t.boolean('sla_reminder_sent').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('appointments', (t) => {
    t.dropColumn('sla_paused_at');
    t.dropColumn('sla_reminder_sent');
  });

  await knex.schema.dropTableIfExists('appointment_proposals');
}
