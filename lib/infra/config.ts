/**
 * Local development infrastructure configuration.
 *
 * Every component is optional: a missing variable turns that integration off
 * rather than crashing the application. This matters because the preview build
 * and CI do not run the Docker stack, and they must keep working.
 *
 * Values come from the gitignored `.env` written by
 * `deploy/dev-infra/gen-secrets.mjs`. Nothing here is logged.
 */

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type InfraConfig = {
  valkeyUrl: string | null;
  meilisearch: { url: string; apiKey: string } | null;
  s3: S3Config | null;
  vectors: { connectionString: string } | null;
  osrm: { url: string } | null;
  prometheus: { url: string } | null;
  metricsToken: string | null;
};

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function infraConfig(): InfraConfig {
  const s3Endpoint = clean(process.env.S3_ENDPOINT);
  const s3Bucket = clean(process.env.S3_BUCKET);
  const s3Access = clean(process.env.S3_ACCESS_KEY_ID);
  const s3Secret = clean(process.env.S3_SECRET_ACCESS_KEY);

  return {
    valkeyUrl: clean(process.env.VALKEY_URL),
    meilisearch:
      clean(process.env.MEILISEARCH_URL) && clean(process.env.MEILISEARCH_API_KEY)
        ? { url: clean(process.env.MEILISEARCH_URL)!, apiKey: clean(process.env.MEILISEARCH_API_KEY)! }
        : null,
    s3:
      s3Endpoint && s3Bucket && s3Access && s3Secret
        ? {
            endpoint: s3Endpoint,
            region: clean(process.env.S3_REGION) ?? "us-east-1",
            bucket: s3Bucket,
            accessKeyId: s3Access,
            secretAccessKey: s3Secret,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false"
          }
        : null,
    vectors: clean(process.env.VECTOR_DATABASE_URL)
      ? { connectionString: clean(process.env.VECTOR_DATABASE_URL)! }
      : null,
    osrm: clean(process.env.OSRM_URL) ? { url: clean(process.env.OSRM_URL)! } : null,
    prometheus: clean(process.env.PROMETHEUS_URL) ? { url: clean(process.env.PROMETHEUS_URL)! } : null,
    metricsToken: clean(process.env.METRICS_TOKEN)
  };
}

/** Components that can answer an HTTP health probe, in dashboard order. */
export const HTTP_COMPONENTS = ["meilisearch", "seaweedfs", "pgvector", "osrm", "prometheus", "grafana", "valkey"] as const;
export type HttpComponent = (typeof HTTP_COMPONENTS)[number];
