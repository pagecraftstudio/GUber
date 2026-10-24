import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort((a, b) => (a < b ? -1 : 1));

describe("migration files", () => {
  it("use NNNN[a-z]_name.sql naming", () => {
    for (const f of files) expect(f).toMatch(/^\d{4}[a-z]?_[a-z0-9_]+\.sql$/);
  });

  it("are numbered contiguously from 0001 with no duplicates", () => {
    const nums = [...new Set(files.map((f) => Number(f.slice(0, 4))))];
    nums.forEach((n, i) => expect(n).toBe(i + 1));
  });

  it("0013b is the only name the Supabase CLI would skip (needs apply-migrations.sh)", () => {
    const cliSkipped = files.filter((f) => !/^\d+_/.test(f));
    expect(cliSkipped).toEqual(["0013b_create_my_booking_idempotency.sql"]);
  });

  it("0013b sorts between 0013 and 0014 in byte order", () => {
    const i = files.findIndex((f) => f.startsWith("0013b_"));
    expect(files[i - 1]).toMatch(/^0013_/);
    expect(files[i + 1]).toMatch(/^0014_/);
  });

  it("migrations 0015+ document their rollback", () => {
    for (const f of files.filter((x) => Number(x.slice(0, 4)) >= 15))
      expect(readFileSync(join(dir, f), "utf8").toLowerCase(), f).toContain("rollback");
  });
});
