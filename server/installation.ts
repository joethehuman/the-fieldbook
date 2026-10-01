import "server-only";
import { deployment } from "./deployment";
import { ServiceError } from "./errors";

/** Operator-owned application identity, independent of the selected backing services. */
export function installation() {
  const origin = deployment().origin;
  const owner = process.env.FIELDBOOK_OWNER_EMAIL?.trim().toLowerCase();
  if (!origin || !owner)
    throw new ServiceError(
      "Fieldbook configuration is incomplete. Ask the operator to check the required environment variables.",
      "configuration",
      "configuration_missing",
    );
  return { origin: new URL(origin).origin, owner };
}

export function siteOrigins() {
  return [
    installation().origin,
    ...deployment().additionalOrigins.map((origin) => new URL(origin).origin),
  ];
}
