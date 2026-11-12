#!/usr/bin/env node
/**
 * CLI guard: verifies the explicitly named isolated test database.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... npx tsx scripts/assert-test-db.ts
 *   TEST_DATABASE_URL=... npx tsx scripts/assert-test-db.ts --require-tables Order,Payment
 *
 * Exit 0 only after current_database(), the schema and the TEST marker pass.
 * Exit 2 on any failure. The connection string is never printed.
 */
import { guardTestDatabaseOrExit, DEFAULT_REQUIRED_TABLES } from "./lib/test-db-guard";

const tableArg = process.argv.find((arg) => arg.startsWith("--require-tables="));
const requiredTables = tableArg
  ? tableArg
      .slice("--require-tables=".length)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  : [...DEFAULT_REQUIRED_TABLES];

void guardTestDatabaseOrExit({ requiredTables });
