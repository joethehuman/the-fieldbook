/** Trusted operator/host configuration; never derived from a request Host header. */
export type Deployment = {
  host: "vercel" | "node";
  preview: boolean;
  origin?: string;
  additionalOrigins: string[];
};

export type DeploymentEnvironment = Record<string, string | undefined>;
