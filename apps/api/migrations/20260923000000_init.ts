import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Initial migration - enables UUID extension for Postgres
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
}

export async function down(_knex: Knex): Promise<void> {
  // Reversal for initial migration
}
