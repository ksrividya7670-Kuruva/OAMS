import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Change Requests table (§7.5, §10.6)
  await knex.schema.createTable('change_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.uuid('requested_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('reason').notNullable();
    t.integer('new_duration_min').nullable();
    t.jsonb('preferred_windows').notNullable().defaultTo('[]');
    t.text('status').notNullable().defaultTo('PENDING'); // PENDING, AWAITING_REQUESTER, APPROVED, REJECTED, WITHDRAWN, EXPIRED
    t.uuid('resolved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('resolved_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer('version').notNullable().defaultTo(1);

    t.index(['appointment_id']);
    t.index(['status']);
    t.index(['requested_by']);
  });

  // Add FK from appointment_proposals.change_request_id to change_requests(id)
  await knex.schema.alterTable('appointment_proposals', (t) => {
    t.foreign('change_request_id').references('id').inTable('change_requests').onDelete('CASCADE');
  });

  // 2. Visits table (§7.6, §15)
  await knex.schema.createTable('visits', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.text('reference_no').notNullable().unique();
    t.text('visitor_name').notNullable();
    t.text('phone').nullable();
    t.text('email').nullable();
    t.text('organization').nullable();
    t.text('id_type').nullable();
    t.text('id_last4').nullable();
    t.text('vehicle_no').nullable();
    t.integer('party_size').notNullable().defaultTo(1);
    t.text('status').notNullable().defaultTo('EXPECTED'); // VisitStatus
    t.text('qr_token_hash').nullable();
    t.timestamp('arrived_at', { useTz: true }).nullable();
    t.timestamp('checked_in_at', { useTz: true }).nullable();
    t.timestamp('with_host_at', { useTz: true }).nullable();
    t.timestamp('checked_out_at', { useTz: true }).nullable();
    t.text('denied_reason').nullable();
    t.text('badge_no').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['appointment_id']);
    t.index(['status']);
    t.index(['reference_no']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('visits');

  await knex.schema.alterTable('appointment_proposals', (t) => {
    t.dropForeign(['change_request_id']);
  });

  await knex.schema.dropTableIfExists('change_requests');
}
