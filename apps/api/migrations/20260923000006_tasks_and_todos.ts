import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Tasks table (§7.6, §12)
  await knex.schema.createTable('tasks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('reference_no').notNullable().unique(); // TSK-YYYY-XXXXXX
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.text('title').notNullable();
    t.text('description').nullable();
    t.text('category').notNullable().defaultTo('OTHER'); // TaskCategory
    t.text('priority').notNullable().defaultTo('MEDIUM'); // Priority
    t.text('status').notNullable().defaultTo('TODO'); // TaskStatus
    t.text('blocked_reason').nullable();
    t.text('cancel_reason').nullable();
    t.text('visibility').notNullable().defaultTo('ORG'); // ORG, PERSONAL
    t.timestamp('start_date', { useTz: true }).nullable();
    t.timestamp('due_at', { useTz: true }).nullable();
    t.integer('estimated_min').nullable();
    t.uuid('owner_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('assignee_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.boolean('requires_verification').notNullable().defaultTo(false);
    t.uuid('verified_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('verified_at', { useTz: true }).nullable();
    t.text('source').notNullable().defaultTo('MANUAL'); // TaskSource (MANUAL, ACTION_ITEM, APPOINTMENT)
    t.uuid('source_id').nullable();
    t.uuid('series_id').nullable();
    t.text('recurrence_rule').nullable();
    t.decimal('position', 14, 4).notNullable().defaultTo(0);
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer('version').notNullable().defaultTo(1);

    t.index(['official_id', 'status', 'due_at']);
    t.index(['assignee_user_id', 'status']);
    t.index(['source', 'source_id']);
    t.index(['series_id']);
  });

  // 2. Checklist items table (§7.6)
  await knex.schema.createTable('task_checklist_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.text('text').notNullable();
    t.boolean('done').notNullable().defaultTo(false);
    t.integer('position').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['task_id', 'position']);
  });

  // 3. Task comments table (§7.6)
  await knex.schema.createTable('task_comments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.uuid('author_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('body').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['task_id', 'created_at']);
  });

  // 4. Task reminders table (§7.6)
  await knex.schema.createTable('task_reminders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.timestamp('remind_at', { useTz: true }).notNullable();
    t.text('channel').notNullable().defaultTo('IN_APP');
    t.timestamp('sent_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['task_id']);
    t.index(['remind_at', 'sent_at']);
  });

  // 5. Task watchers table (§7.6)
  await knex.schema.createTable('task_watchers', (t) => {
    t.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(['task_id', 'user_id']);
  });

  // 6. Task dependencies table (§7.6)
  await knex.schema.createTable('task_dependencies', (t) => {
    t.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.uuid('depends_on_task_id')
      .notNullable()
      .references('id')
      .inTable('tasks')
      .onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(['task_id', 'depends_on_task_id']);
  });

  // 7. Task attachments table (§7.6)
  await knex.schema.createTable('task_attachments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.text('file_name').notNullable();
    t.integer('file_size').notNullable();
    t.text('mime_type').notNullable();
    t.text('file_path').notNullable();
    t.uuid('uploaded_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['task_id']);
  });

  // 8. Task exports table (§12.7)
  await knex.schema.createTable('task_exports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('file_name').notNullable();
    t.text('file_path').notNullable();
    t.text('format').notNullable(); // CSV, XLSX, PDF
    t.text('status').notNullable().defaultTo('READY'); // PENDING, PROCESSING, READY, FAILED
    t.integer('row_count').notNullable().defaultTo(0);
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['user_id']);
    t.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_exports');
  await knex.schema.dropTableIfExists('task_attachments');
  await knex.schema.dropTableIfExists('task_dependencies');
  await knex.schema.dropTableIfExists('task_watchers');
  await knex.schema.dropTableIfExists('task_reminders');
  await knex.schema.dropTableIfExists('task_comments');
  await knex.schema.dropTableIfExists('task_checklist_items');
  await knex.schema.dropTableIfExists('tasks');
}
