import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('notifications');
  if (hasTable) {
    const hasAppointmentId = await knex.schema.hasColumn('notifications', 'appointment_id');
    if (!hasAppointmentId) {
      await knex.schema.alterTable('notifications', (t) => {
        t.uuid('appointment_id').nullable();
        t.index(['appointment_id']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('notifications');
  if (hasTable) {
    const hasAppointmentId = await knex.schema.hasColumn('notifications', 'appointment_id');
    if (hasAppointmentId) {
      await knex.schema.alterTable('notifications', (t) => {
        t.dropColumn('appointment_id');
      });
    }
  }
}
