export async function up(knex) {
  // Initial migration - enables UUID extension for Postgres
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
}
export async function down(_knex) {
  // Reversal for initial migration
}
//# sourceMappingURL=20260923000000_init.js.map
