// Handles running chart SQL queries (separated for clarity)

export async function runChartSQL(draftSQL: string) {
  if (!draftSQL?.trim()) return { error: "No SQL provided" };

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_DATA_ENGINE_API}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: draftSQL }),
    });

    const data = await res.json();

    if (data?.error) {
      return { error: data.error };
    }
    if (!data?.rows?.length) {
      return { error: "No rows returned" };
    }

    return { rows: data.rows };
  } catch (err) {
    console.error("SQL request failed:", err);
    return { error: String(err) };
  }
}
