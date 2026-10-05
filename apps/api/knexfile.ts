import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function convertKeysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((v) => convertKeysToCamel(v));
  }
  if (
    obj !== null &&
    typeof obj === 'object' &&
    !(obj instanceof Date) &&
    !(obj instanceof RegExp)
  ) {
    const newObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      newObj[toCamelCase(key)] = convertKeysToCamel(value);
    }
    return newObj;
  }
  return obj;
}

export const postProcessResponse = (result: unknown): unknown => {
  return convertKeysToCamel(result);
};

export const wrapIdentifier = (value: string, origImpl: (value: string) => string): string => {
  if (value === '*') return value;
  return origImpl(toSnakeCase(value));
};

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection:
      process.env.DATABASE_URL || 'postgres://oams_user:oams_password@localhost:5432/oams_db',
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.resolve(__dirname, './migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.resolve(__dirname, './seeds'),
      extension: 'ts',
    },
    postProcessResponse,
    wrapIdentifier,
  },
  test: {
    client: 'pg',
    connection:
      process.env.DATABASE_TEST_URL ||
      process.env.DATABASE_URL ||
      'postgres://oams_user:oams_password@localhost:5432/oams_db',
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.resolve(__dirname, './migrations'),
      extension: 'ts',
    },
    postProcessResponse,
    wrapIdentifier,
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 20,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.resolve(__dirname, './migrations'),
      extension: 'js',
    },
    postProcessResponse,
    wrapIdentifier,
  },
};

export default config;
