// Paginated Supabase fetcher to bypass the default 1000-row limit.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T = any>(builder: any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await builder.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
