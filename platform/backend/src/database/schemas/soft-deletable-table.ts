import type { BuildColumns, BuildExtraConfigColumns } from "drizzle-orm";
import { isNull, sql, and, eq } from "drizzle-orm";
import {
  type AnyPgColumn,
  type PgColumnBuilderBase,
  type PgTableExtraConfigValue,
  type PgTableWithColumns,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Mixin spread into a `pgTable` column object to opt a table into soft deletion.
 * `deletedAt` is NULL for active rows, non-NULL for soft-deleted ones.
 */
export const softDeleteColumns = {
  deletedAt: timestamp("deleted_at", { mode: "date" }),
};

export type SoftDeletableTable = {
  deletedAt: AnyPgColumn;
};

/**
 * Global filter helper to exclude soft-deleted rows from Drizzle queries.
 * Usage: db.select().from(users).where(withActive(users))
 */
export const withActive = (table: SoftDeletableTable) => isNull(table.deletedAt);

/**
 * Legacy helper maintained for backward compatibility with existing tests.
 */
export const notDeleted = (table: SoftDeletableTable) => isNull(table.deletedAt);

type WithSoftDelete<TColumnsMap extends Record<string, PgColumnBuilderBase>> =
  TColumnsMap & typeof softDeleteColumns;

/**
 * Advanced softDeletablePgTable wrapper.
 * Automatically injects the `deleted_at` field and exposes helpers for indices.
 */
export function softDeletablePgTable<
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
>(
  name: TTableName,
  columns: TColumnsMap,
  extraConfig?: (
    self: BuildExtraConfigColumns<
      TTableName,
      WithSoftDelete<TColumnsMap>,
      "pg"
    >,
  ) => PgTableExtraConfigValue[],
): PgTableWithColumns<{
  name: TTableName;
  schema: undefined;
  columns: BuildColumns<TTableName, WithSoftDelete<TColumnsMap>, "pg">;
  dialect: "pg";
}> {
  return pgTable(name, { ...columns, ...softDeleteColumns }, extraConfig);
}

/**
 * CRITICAL FIX: Generates a partial unique index that applies ONLY to active rows.
 * Prevents "Unique Constraint" crashes when re-creating soft-deleted records.
 * Enforces a strict tuple type to eliminate TS2556 spread validation errors.
 * Usage inside extraConfig: (table) => [uniqueActiveIndex(table, "unique_slug_idx", [table.slug])]
 */
export function uniqueActiveIndex(
  table: SoftDeletableTable,
  indexName: string,
  columns: [AnyPgColumn, ...AnyPgColumn[]],
) {
  return uniqueIndex(indexName)
    .on(columns[0], ...columns.slice(1))
    .where(isNull(table.deletedAt));
}

/**
 * CENTRALIZED MUTATION HELPERS
 */
export const softDeleteMutation = {
  /**
   * Performs a soft delete operation on a target table row.
   */
  execute: (table: SoftDeletableTable) => ({
    deletedAt: new Date(),
  }),

  /**
   * Restores a soft-deleted row back to active status.
   */
  restore: (table: SoftDeletableTable) => ({
    deletedAt: null,
  }),
};