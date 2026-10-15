import type { PrivateStorage } from "../../src/lib/gateways/credential-store.server";

type Result<T> = { data: T | null; error: { message: string } | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(message: string): Result<T> => ({ data: null, error: { message } });

/**
 * Storage falso com o comportamento do Supabase que o cofre usa: bucket ausente dá erro
 * na listagem, upload sem upsert recusa arquivo existente, list devolve só o "nível" da
 * pasta. Permite injetar falhas (`failNext`), exceções de rede (`throwNext`), chamadas
 * que nunca respondem (`hangNext`) e uma gravação concorrente logo após um upload
 * (`afterUpload`).
 */
export class FakeStorage implements PrivateStorage {
  buckets = new Map<string, { public: boolean }>();
  files = new Map<string, string>();
  calls: string[] = [];
  failNext = new Map<string, string>();
  throwNext = new Set<string>();
  hangNext = new Set<string>();
  /** Deixa o updateBucket "funcionar" sem mudar nada (bucket teimoso). */
  ignoreUpdate = false;
  /** Chamado depois de cada upload bem-sucedido (para simular outro servidor gravando). */
  afterUpload: ((key: string) => void) | null = null;

  private async guard<T>(op: string): Promise<Result<T> | null> {
    this.calls.push(op);
    if (this.hangNext.delete(op)) await new Promise(() => {});
    if (this.throwNext.delete(op)) throw new TypeError(`fetch failed (${op})`);
    const message = this.failNext.get(op);
    if (message !== undefined) {
      this.failNext.delete(op);
      return fail(message);
    }
    return null;
  }

  async listBuckets() {
    const g = await this.guard<Array<{ id: string; public: boolean }>>("listBuckets");
    if (g) return g;
    return ok([...this.buckets].map(([id, b]) => ({ id, name: id, public: b.public })));
  }

  async createBucket(id: string, options: { public: boolean }) {
    const g = await this.guard<unknown>("createBucket");
    if (g) return g;
    if (this.buckets.has(id)) return fail("The resource already exists");
    this.buckets.set(id, { public: options.public });
    return ok({ name: id });
  }

  async updateBucket(id: string, options: { public: boolean }) {
    const g = await this.guard<unknown>("updateBucket");
    if (g) return g;
    const bucket = this.buckets.get(id);
    if (!bucket) return fail("Bucket not found");
    if (!this.ignoreUpdate) bucket.public = options.public;
    return ok({ message: "Successfully updated" });
  }

  from(bucket: string) {
    return {
      list: async (
        path: string,
        options: { limit: number; offset: number; sortBy: { column: string; order: string } },
      ) => {
        const g = await this.guard<Array<{ name: string }>>("list");
        if (g) return g;
        if (!this.buckets.has(bucket)) return fail<Array<{ name: string }>>("Bucket not found");
        const prefix = path ? `${bucket}/${path.replace(/\/$/, "")}/` : `${bucket}/`;
        const names = new Set<string>();
        for (const key of this.files.keys()) {
          if (!key.startsWith(prefix)) continue;
          names.add(key.slice(prefix.length).split("/")[0]!);
        }
        const sorted = [...names].sort();
        if (options.sortBy.order === "desc") sorted.reverse();
        return ok(
          sorted
            .slice(options.offset, options.offset + options.limit)
            .map((name) => ({ name, id: name })),
        );
      },
      upload: async (
        path: string,
        body: string,
        options: { contentType: string; upsert: boolean; cacheControl: string },
      ) => {
        const g = await this.guard<unknown>("upload");
        if (g) return g;
        if (!this.buckets.has(bucket)) return fail("Bucket not found");
        const key = `${bucket}/${path}`;
        if (this.files.has(key) && !options.upsert) return fail("The resource already exists");
        this.files.set(key, body);
        this.afterUpload?.(key);
        return ok({ path });
      },
      download: async (path: string) => {
        const g = await this.guard<Blob>("download");
        if (g) return g;
        const body = this.files.get(`${bucket}/${path}`);
        if (body === undefined) return fail<Blob>("Object not found");
        return ok(new Blob([body], { type: "application/json" }));
      },
      remove: async (paths: string[]) => {
        const g = await this.guard<unknown>("remove");
        if (g) return g;
        for (const p of paths) this.files.delete(`${bucket}/${p}`);
        return ok(paths.map((name) => ({ name })));
      },
    };
  }

  /** Versões gravadas de um escopo, da mais nova para a mais antiga. */
  versions(scope: string) {
    return [...this.files.keys()]
      .filter((k) => k.startsWith(`configuracao-privada/${scope}/`))
      .map((k) => k.split("/").pop()!)
      .sort()
      .reverse();
  }
}
