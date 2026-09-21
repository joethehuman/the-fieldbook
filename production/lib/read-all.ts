import "server-only";
import { check } from "./db";
import { ServiceError } from "./errors";

/** Call with a fresh query, exact count, and a unique, stable ordering.
 * Advance by rows received: an installation may cap pages below our request.
 * Reject incomplete/changed reads instead of returning plausible partial totals.
 * Separate requests are not a transactional snapshot of concurrent edits.
 */
export async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string; code?: string } | null;
    count: number | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | undefined;
  do {
    const result = await page(rows.length, rows.length + 499);
    check(result.error);
    if (
      result.count === null ||
      result.count < rows.length + (result.data?.length || 0) ||
      (total !== undefined && result.count !== total) ||
      !result.data ||
      (!result.data.length && rows.length < result.count)
    )
      throw new ServiceError(
        "The data could not be read completely. Reload and try again.",
        "database",
        "incomplete_read",
      );
    total = result.count;
    rows.push(...result.data);
  } while (rows.length < total);
  return rows;
}
