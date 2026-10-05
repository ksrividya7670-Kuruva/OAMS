export async function up(knex) {
  // 1. Enable btree_gist extension for exclusion constraints on equality (=) and range overlap (&&)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
  // 2. Calendar Events (§7.3)
  await knex.schema.createTable('calendar_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('calendar_id').notNullable().references('id').inTable('calendars').onDelete('CASCADE');
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.text('kind').notNullable().defaultTo('MEETING'); // MEETING, BLOCK, TRAVEL, LEAVE, PERSONAL, APPOINTMENT, HOLD
    t.text('block_strength').notNullable().defaultTo('HARD'); // HARD, SOFT, NONE
    t.text('title').notNullable();
    t.text('description').nullable();
    t.text('location').nullable();
    t.timestamp('start_at', { useTz: true }).notNullable();
    t.timestamp('end_at', { useTz: true }).notNullable();
    t.boolean('all_day').notNullable().defaultTo(false);
    t.specificType('occupied_range', 'tstzrange').notNullable();
    t.text('visibility').notNullable().defaultTo('INTERNAL'); // PUBLIC, INTERNAL, CONFIDENTIAL, PERSONAL
    t.uuid('appointment_id').nullable();
    t.uuid('room_booking_id').nullable();
    t.timestamp('hold_expires_at', { useTz: true }).nullable();
    t.text('recurrence_rule').nullable();
    t.uuid('series_id').nullable();
    t.timestamp('original_start_at', { useTz: true }).nullable();
    t.text('status').notNullable().defaultTo('ACTIVE'); // ACTIVE, CANCELLED
    t.text('external_source').notNullable().defaultTo('NONE'); // NONE, OUTLOOK
    t.text('external_id').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.index(['official_id', 'start_at', 'end_at']);
    t.index(['calendar_id', 'start_at', 'end_at']);
    t.index(['org_id', 'start_at', 'end_at']);
    t.index(['status', 'hold_expires_at']);
  });
  // Double-booking exclusion constraint (§7.3)
  await knex.raw(`
    ALTER TABLE calendar_events ADD CONSTRAINT no_overlap_hard
      EXCLUDE USING gist (official_id WITH =, occupied_range WITH &&)
      WHERE (status = 'ACTIVE' AND block_strength = 'HARD');
  `);
  // 3. Availability Rules (§7.3)
  await knex.schema.createTable('availability_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.integer('weekday').notNullable(); // 1=Mon .. 7=Sun
    t.time('start_local').notNullable();
    t.time('end_local').notNullable();
    t.date('effective_from').notNullable();
    t.date('effective_to').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.index(['official_id', 'weekday']);
  });
  // 4. Availability Exceptions (§7.3)
  await knex.schema.createTable('availability_exceptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.date('date').notNullable();
    t.time('start_local').nullable();
    t.time('end_local').nullable();
    t.text('type').notNullable(); // EXTRA_AVAILABLE, UNAVAILABLE
    t.text('reason').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.index(['official_id', 'date']);
  });
  // 5. Protected Blocks (§7.3)
  await knex.schema.createTable('protected_blocks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.integer('weekday').nullable();
    t.date('date').nullable();
    t.time('start_local').notNullable();
    t.time('end_local').notNullable();
    t.text('label').notNullable();
    t.text('block_strength').notNullable().defaultTo('HARD'); // HARD, SOFT
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.index(['official_id']);
  });
  // 6. Holidays (§7.3)
  await knex.schema.createTable('holidays', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.date('date').notNullable();
    t.text('name').notNullable();
    t.boolean('is_optional').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['org_id', 'date']);
  });
  // 7. Rooms (§7.4)
  await knex.schema.createTable('rooms', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('building').notNullable();
    t.text('floor').notNullable();
    t.integer('capacity').notNullable();
    t.jsonb('equipment').notNullable().defaultTo('[]');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('setup_min').notNullable().defaultTo(0);
    t.integer('cleanup_min').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.index(['org_id', 'is_active']);
  });
  // 8. Room Bookings (§7.4)
  await knex.schema.createTable('room_bookings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
    t.uuid('appointment_id').nullable();
    t.specificType('occupied_range', 'tstzrange').notNullable();
    t.timestamp('start_at', { useTz: true }).notNullable();
    t.timestamp('end_at', { useTz: true }).notNullable();
    t.text('status').notNullable().defaultTo('ACTIVE'); // ACTIVE, RELEASED
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.index(['room_id', 'start_at', 'end_at']);
  });
  // Room overlap exclusion constraint (§7.4)
  await knex.raw(`
    ALTER TABLE room_bookings ADD CONSTRAINT no_overlap_room
      EXCLUDE USING gist (room_id WITH =, occupied_range WITH &&)
      WHERE (status = 'ACTIVE');
  `);
  // 9. Capacity Policies (§7.2)
  await knex.schema.createTable('capacity_policies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('official_id').notNullable().references('id').inTable('officials').onDelete('CASCADE');
    t.integer('max_appointments_per_day').notNullable().defaultTo(8);
    t.integer('max_duration_minutes_per_day').notNullable().defaultTo(360);
    t.integer('max_consecutive_meetings').notNullable().defaultTo(3);
    t.integer('min_break_minutes').notNullable().defaultTo(15);
    t.text('on_exceed').notNullable().defaultTo('WARN'); // WARN, BLOCK
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by').nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('updated_by').nullable();
    t.integer('version').notNullable().defaultTo(1);
    t.unique(['official_id']);
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('capacity_policies');
  await knex.schema.dropTableIfExists('room_bookings');
  await knex.schema.dropTableIfExists('rooms');
  await knex.schema.dropTableIfExists('holidays');
  await knex.schema.dropTableIfExists('protected_blocks');
  await knex.schema.dropTableIfExists('availability_exceptions');
  await knex.schema.dropTableIfExists('availability_rules');
  await knex.schema.dropTableIfExists('calendar_events');
}
//# sourceMappingURL=20260923000002_calendars_and_scheduling.js.map
