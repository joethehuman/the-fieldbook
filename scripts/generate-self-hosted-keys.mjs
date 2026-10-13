import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Matches Supabase's asymmetric Auth key format. All returned values are
 * private configuration except ANON_KEY. Never log this object. */
export function generateSelfHostedKeys(now = Math.floor(Date.now() / 1000)) {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const kid = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const legacy = {
    kty: "oct",
    k: Buffer.from(secret).toString("base64url"),
    alg: "HS256",
  };
  const publicKey = {
    kty: "EC",
    kid,
    use: "sig",
    key_ops: ["verify"],
    alg: "ES256",
    ext: true,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
  };
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const apiKey = (role) => {
    const body = `${encode({ alg: "ES256", typ: "JWT", kid })}.${encode({ role, iss: "supabase", iat: now, exp: now + 5 * 365 * 86400 })}`;
    return `${body}.${sign("SHA256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  return {
    JWT_SECRET: secret,
    JWT_KEYS: JSON.stringify([
      { ...publicKey, key_ops: ["sign", "verify"], d: jwk.d },
      legacy,
    ]),
    // Includes the legacy symmetric key for Storage signatures; keep server-only.
    JWT_JWKS: JSON.stringify({ keys: [publicKey, legacy] }),
    ANON_KEY: apiKey("anon"),
    SERVICE_ROLE_KEY: apiKey("service_role"),
    AUTH_DATABASE_PASSWORD: randomBytes(32).toString("hex"),
    REST_DATABASE_PASSWORD: randomBytes(32).toString("hex"),
    STORAGE_DATABASE_PASSWORD: randomBytes(32).toString("hex"),
  };
}

export function writeSelfHostedKeys(filename) {
  const keys = generateSelfHostedKeys();
  // Exclusive creation prevents accidentally replacing keys on a restart/update.
  writeFileSync(
    filename,
    Object.entries(keys)
      .map(([key, value]) => `${key}='${value}'`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--output")
      throw new Error(
        "Usage: node scripts/generate-self-hosted-keys.mjs --output /private/path/keys.env",
      );
    writeSelfHostedKeys(process.argv[3]);
    console.log(
      "Private keys saved with owner-only permissions. Back up this file; reuse its values across deployments. No keys were printed.",
    );
  } catch {
    console.error(
      "Keys were not written. Use --output with a new file in a private directory; existing files are never replaced.",
    );
    process.exitCode = 1;
  }
}
