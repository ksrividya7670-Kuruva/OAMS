import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Meeting Notes table (§7.6, §16)
  await knex.schema.createTable('meeting_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.text('body').notNullable(); // rich text / markdown notes
    t.text('decisions').nullable(); // agreed decisions summary
    t.text('visibility').notNullable().defaultTo('INTERNAL'); // inherits from appointment
    t.uuid('author_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['appointment_id']);
    t.index(['org_id']);
    t.index(['author_id']);
  });

  // 2. Action Items table (§7.6, §12.5, §16)
  await knex.schema.createTable('action_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('appointment_id')
      .notNullable()
      .references('id')
      .inTable('appointments')
      .onDelete('CASCADE');
    t.uuid('note_id').nullable().references('id').inTable('meeting_notes').onDelete('SET NULL');
    t.text('title').notNullable();
    t.uuid('owner_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('due_date', { useTz: true }).nullable();
    t.text('status').notNullable().defaultTo('OPEN'); // OPEN, DONE, CANCELLED
    t.uuid('converted_task_id').nullable().references('id').inTable('tasks').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['appointment_id']);
    t.index(['note_id']);
    t.index(['owner_user_id']);
    t.index(['converted_task_id']);
    t.index(['status']);
  });

  // 3. Add parent_appointment_id to appointments table for follow-up tracking (§16)
  const hasParentCol = await knex.schema.hasColumn('appointments', 'parent_appointment_id');
  if (!hasParentCol) {
    await knex.schema.alterTable('appointments', (t) => {
      t.uuid('parent_appointment_id')
        .nullable()
        .references('id')
        .inTable('appointments')
        .onDelete('SET NULL');
      t.index(['parent_appointment_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasParentCol = await knex.schema.hasColumn('appointments', 'parent_appointment_id');
  if (hasParentCol) {
    await knex.schema.alterTable('appointments', (t) => {
      t.dropColumn('parent_appointment_id');
    });
  }

  await knex.schema.dropTableIfExists('action_items');
  await knex.schema.dropTableIfExists('meeting_notes');
}
