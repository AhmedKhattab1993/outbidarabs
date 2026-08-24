// Payment environment tag. Dodo (test mode) delivers every payment.succeeded
// event to ALL webhook endpoints registered on the account — staging,
// production and local tunnels all receive everything. Each deployment
// therefore tags its checkouts (metadata.env) and its webhook applies only
// events tagged for its own environment. Live mode uses separate endpoints,
// but the same guard keeps that safe too.
export type PaymentsEnv = "local" | "staging" | "prod";

export function paymentsEnvTag(): PaymentsEnv {
  const v = process.env.VERCEL_ENV;
  if (v === "production") return "prod";
  if (v === "preview") return "staging";
  return "local";
}
