// 持久化协调器：基于站点私有数据库的租约锁（版本 CAS 围栏），供 ensureCloudResources 使用。
// 表结构见 functions/schema.sql（app.coord）。
import { createDatabaseClient } from "./_qoder/backend.mjs";

type Lease = {
  read: () => Promise<Record<string, unknown> | null>;
  write: (record: Record<string, unknown>) => Promise<void>;
  assertHeld: () => Promise<void>;
};

const LEASE_MS = 60_000;
const ACQUIRE_ATTEMPTS = 8;

const rows = (result: unknown): Record<string, unknown>[] =>
  Array.isArray(result) ? result : ((result as { data?: unknown })?.data as Record<string, unknown>[]) ?? [];

export function createDbCoordinator() {
  const db = createDatabaseClient();

  async function withLock<T>(key: string, callback: (lease: Lease) => Promise<T>): Promise<T> {
    await db.from("coord").insertIfAbsent({ key }, { onConflict: "key" });
    const holder = crypto.randomUUID();
    let myVersion = -1;
    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt++) {
      const current = rows(await db.from("coord").select("version,holder,expires_at").eq("key", key).limit(1))[0];
      if (!current) throw new Error("coordinator_row_missing");
      const busy = current.holder !== "" && Number(current.expires_at) > Date.now();
      if (!busy) {
        const version = Number(current.version);
        const acquired = rows(
          await db
            .from("coord")
            .update({ holder, expires_at: Date.now() + LEASE_MS, version: version + 1 })
            .eq("key", key)
            .eq("version", version)
            .select("version"),
        );
        if (acquired.length === 1) {
          myVersion = version + 1;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (myVersion < 0) throw new Error("coordinator_busy");

    const assertHeld = async () => {
      const row = rows(await db.from("coord").select("version,holder,expires_at").eq("key", key).limit(1))[0];
      if (!row || row.holder !== holder || Number(row.version) !== myVersion || Number(row.expires_at) <= Date.now()) {
        throw new Error("coordinator_lease_lost");
      }
    };
    const lease: Lease = {
      read: async () => {
        const row = rows(await db.from("coord").select("value").eq("key", key).limit(1))[0];
        if (!row || typeof row.value !== "string" || !row.value) return null;
        try {
          return JSON.parse(row.value);
        } catch {
          return null;
        }
      },
      write: async (record) => {
        const updated = rows(
          await db
            .from("coord")
            .update({ value: JSON.stringify(record), version: myVersion + 1 })
            .eq("key", key)
            .eq("holder", holder)
            .eq("version", myVersion)
            .select("version"),
        );
        if (updated.length !== 1) throw new Error("coordinator_lease_lost");
        myVersion += 1;
      },
      assertHeld,
    };
    try {
      return await callback(lease);
    } finally {
      try {
        await db
          .from("coord")
          .update({ holder: "", expires_at: 0, version: myVersion + 1 })
          .eq("key", key)
          .eq("holder", holder)
          .eq("version", myVersion);
      } catch {
        // 释放失败只影响下一次获取的等待时间，租约到期后自然可接管。
      }
    }
  }

  return { withLock };
}