import type { Workspace } from "./store";

// A failed request can have committed on the server. Never silently replay it.
export class SaveRecoveryError extends Error {
  constructor(
    message: string,
    public snapshot?: Workspace,
  ) {
    super(message);
  }
}
