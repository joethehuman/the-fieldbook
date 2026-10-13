import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import {
  generateSelfHostedKeys,
  writeSelfHostedKeys,
} from "../scripts/generate-self-hosted-keys.mjs";
import { prepareDigitalOcean } from "../scripts/prepare-digitalocean.mjs";

const { load } = createRequire(import.meta.url)("js-yaml");
const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const spec = load(read(".do/app.yaml"));

test("backend keys verify with the persisted asymmetric key and distinct least-privilege roles", () => {
  const keys = generateSelfHostedKeys(1_800_000_000);
  const signing = JSON.parse(keys.JWT_KEYS);
  const verification = JSON.parse(keys.JWT_JWKS);
  assert.equal(signing[0].alg, "ES256");
  assert.ok(signing[0].d);
  assert.equal(verification.keys[0].d, undefined);
  assert.equal(
    Buffer.from(verification.keys[1].k, "base64url").toString(),
    keys.JWT_SECRET,
  );
  const publicKey = createPublicKey({
    key: verification.keys[0],
    format: "jwk",
  });
  for (const [key, role] of [
    [keys.ANON_KEY, "anon"],
    [keys.SERVICE_ROLE_KEY, "service_role"],
  ]) {
    const [header, payload, signature] = key.split(".");
    assert.equal(
      verify(
        "SHA256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
      true,
    );
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.equal(claims.role, role);
    assert.equal(claims.exp - claims.iat, 5 * 365 * 86400);
    assert.equal(claims.sub, undefined);
  }
  assert.equal(
    new Set([
      keys.AUTH_DATABASE_PASSWORD,
      keys.REST_DATABASE_PASSWORD,
      keys.STORAGE_DATABASE_PASSWORD,
    ]).size,
    3,
  );
});

test("key generation is private, silent about secrets and never overwrites existing durable keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldbook-keys-test-"));
  try {
    const file = join(directory, "keys.env");
    writeSelfHostedKeys(file);
    const original = readFileSync(file, "utf8");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => writeSelfHostedKeys(file), /EEXIST/);
    assert.equal(readFileSync(file, "utf8"), original);
    const processResult = spawnSync(
      process.execPath,
      [
        "scripts/generate-self-hosted-keys.mjs",
        "--output",
        join(directory, "other.env"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(processResult.status, 0);
    assert.doesNotMatch(
      processResult.stdout + processResult.stderr,
      /eyJ|JWT_SECRET=|DATABASE_PASSWORD=/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function client(database: PGlite, emulate17 = true) {
  return {
    query: async (sql: string, params?: unknown[]) => {
      // PGlite is PG18.3. Exercise the preparation SQL, but explicitly substitute
      // its version guard; this is NOT evidence for Managed PostgreSQL 17.
      const rendered = emulate17
        ? sql.replaceAll("current_setting('server_version_num')::int", "170000")
        : sql;
      if (params?.length) return database.query(rendered, params);
      const results = await database.exec(rendered);
      return results.at(-1) || { rows: [] };
    },
  };
}

test("fresh backend preparation gives each service its schema and only the needed role memberships", async () => {
  const database = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  try {
    await prepareDigitalOcean(client(database), generateSelfHostedKeys());
    const roles = await database.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
    }>(
      "select rolname,rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin','service_role') order by rolname",
    );
    assert.equal(roles.rows.length, 4);
    for (const role of roles.rows) {
      assert.equal(role.rolsuper, false);
      assert.equal(role.rolcreaterole, false);
      assert.equal(role.rolbypassrls, role.rolname === "service_role");
    }
    const access = await database.query(
      "select pg_has_role('authenticator','service_role','MEMBER') rest_service, pg_has_role('supabase_storage_admin','service_role','MEMBER') storage_service, pg_has_role('supabase_auth_admin','service_role','MEMBER') auth_service, has_schema_privilege('authenticated','public','CREATE') public_create",
    );
    assert.deepEqual(access.rows, [
      {
        rest_service: true,
        storage_service: true,
        auth_service: false,
        public_create: false,
      },
    ]);
    // Vendor-owned table stand-ins validate ownership/default grants, not vendor migrations.
    await database.exec(
      "set role supabase_auth_admin; create table auth.users(id uuid primary key); reset role; set role supabase_storage_admin; create table storage.objects(id int primary key); alter table storage.objects enable row level security; reset role;",
    );
    await database.exec("set role authenticated");
    await assert.rejects(
      database.exec("select * from auth.users"),
      /permission denied/,
    );
    await assert.rejects(
      database.exec("insert into storage.objects values(1)"),
      /row-level security/,
    );
    await database.exec(
      "reset role; set role supabase_storage_admin; set role service_role; insert into storage.objects values(1); reset role;",
    );
    assert.deepEqual(
      (await database.query("select id from storage.objects")).rows,
      [{ id: 1 }],
    );
    await assert.rejects(
      prepareDigitalOcean(client(database), generateSelfHostedKeys()),
      /empty dedicated/,
    );
    assert.deepEqual(
      (await database.query("select id from storage.objects")).rows,
      [{ id: 1 }],
    );
  } finally {
    await database.close();
  }
});

test("preparation rejects unrelated data and unsupported PostgreSQL before creating service roles", async () => {
  for (const mode of ["data", "version"]) {
    const database = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
    try {
      if (mode === "data")
        await database.exec(
          "create table public.unrelated(id int); insert into public.unrelated values(7)",
        );
      await assert.rejects(
        prepareDigitalOcean(
          client(database, mode === "data"),
          generateSelfHostedKeys(),
        ),
        mode === "data" ? /empty dedicated/ : /PostgreSQL 17/,
      );
      assert.deepEqual(
        (
          await database.query(
            "select rolname from pg_roles where rolname='service_role'",
          )
        ).rows,
        [],
      );
      if (mode === "data")
        assert.deepEqual(
          (await database.query("select id from unrelated")).rows,
          [{ id: 7 }],
        );
    } finally {
      await database.close();
    }
  }
});

test("ingress routes OAuth discovery and ordinary/signed resumable media directly to their services", () => {
  function route(path: string) {
    const rule = spec.ingress.rules.find(
      (rule: any) =>
        path === rule.match.path.prefix ||
        path.startsWith(`${rule.match.path.prefix.replace(/\/$/, "")}/`),
    );
    assert.ok(rule, path);
    const prefix = rule.match.path.prefix;
    const destination = rule.component.preserve_path_prefix
      ? path
      : `${rule.component.rewrite || "/"}${path.slice(prefix.length).replace(/^\//, "")}`;
    return [rule.component.name, destination];
  }
  assert.deepEqual(route("/backend/auth/v1/callback"), ["auth", "/callback"]);
  assert.deepEqual(
    route("/.well-known/oauth-authorization-server/backend/auth/v1"),
    ["auth", "/.well-known/oauth-authorization-server"],
  );
  assert.deepEqual(route("/backend/auth/v1/oauth/token"), [
    "auth",
    "/oauth/token",
  ]);
  assert.deepEqual(route("/backend/rest/v1/fb_profiles"), [
    "rest",
    "/fb_profiles",
  ]);
  assert.deepEqual(
    route("/backend/storage/v1/object/upload/sign/fieldbook-media/file"),
    ["storage", "/object/upload/sign/fieldbook-media/file"],
  );
  assert.deepEqual(route("/backend/storage/v1/upload/resumable/sign"), [
    "storage",
    "/upload/resumable/sign",
  ]);
  assert.deepEqual(route("/upload/resumable/sign/opaque-upload-id"), [
    "storage",
    "/upload/resumable/sign/opaque-upload-id",
  ]);
  assert.deepEqual(route("/api/mcp"), ["fieldbook", "/api/mcp"]);
});

test("recipe preserves verified TLS, persistent signing keys and runtime-only secret boundaries", () => {
  const service = (name: string) =>
    spec.services.find((entry: any) => entry.name === name);
  const envs = (name: string) =>
    Object.fromEntries(
      service(name).envs.map((entry: any) => [entry.key, entry.value]),
    );
  assert.equal(spec.disable_edge_cache, true);
  assert.equal(spec.databases[0].production, true);
  assert.equal(spec.databases[0].version, "17");
  assert.match(
    envs("auth").GOTRUE_DB_DATABASE_URL,
    /sslmode=verify-full&sslrootcert=/,
  );
  assert.match(envs("rest").PGRST_DB_URI, /sslmode=verify-full&sslrootcert=/);
  assert.match(envs("storage").DATABASE_URL, /sslmode=verify-full&sslrootcert=/);
  assert.equal(envs("storage").DATABASE_CA_CERT, "${backend-db.CA_CERT}");
  assert.equal(envs("storage").DATABASE_SSL_ROOT_CERT, "${backend-db.CA_CERT}");
  assert.equal(envs("storage").REQUEST_ALLOW_X_FORWARDED_PATH, "false");
  assert.equal(envs("storage").STORAGE_BACKEND, "s3");
  assert.equal(envs("storage").TUS_ALLOW_S3_TAGS, "false");
  assert.equal(envs("storage").STORAGE_VERSIONING_ENABLED, "false");
  assert.equal(envs("storage").DB_ALLOW_MIGRATION_REFRESH, "false");
  assert.equal(envs("auth").GOTRUE_OAUTH_SERVER_ENABLED, "false");
  for (const component of [...spec.services, ...spec.jobs]) {
    for (const entry of component.envs) {
      if (entry.type === "SECRET")
        assert.equal(
          entry.scope,
          "RUN_TIME",
          `${component.name}: ${entry.key}`,
        );
    }
  }
  assert.equal(envs("fieldbook").JWT_KEYS, undefined);
  assert.equal(envs("fieldbook").DATABASE_URL, undefined);
  assert.match(read("Dockerfile.supabase-auth"), /gotrue:v2\.197\.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b/);
  assert.match(
    read("Dockerfile.supabase-rest"),
    /^FROM postgrest\/postgrest:v16\.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df$/m,
  );
  assert.equal(service("storage").dockerfile_path, "Dockerfile.supabase-storage");
  assert.match(
    read("Dockerfile.supabase-storage"),
    /^FROM supabase\/storage-api:v1\.81\.1@sha256:e049f1f602fede44ae88472ee64390d21556e8d6b26e865a4b2f6475289d1186$/m,
  );
  assert.doesNotMatch(
    read(".do/app.yaml"),
    /NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized: false|backend-gateway|kong/i,
  );
});
