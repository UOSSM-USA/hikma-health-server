import ServerVariable from "@/models/server_variable.ts";
import type { StorageAdapter } from "./adapters/base.ts";
import { loadConfigFromServerVariables } from "./adapters/base.ts";
import { isStoreType, type StoreType } from "./types.ts";

const { getAsString, getAsJson } = ServerVariable;

/** Reads the `hh_store_type` server variable, defaulting to "disk" when unset. */
export const getConfiguredStoreType = async (): Promise<StoreType> => {
  const raw = await getAsString(ServerVariable.Keys.HH_STORE_TYPE);
  const value = raw ?? "disk";
  if (!isStoreType(value)) {
    throw new Error(`Unsupported storage type configured: "${value}"`);
  }
  return value;
};

/** Adapter SDKs are dynamically imported so unused cloud SDKs never load. */
export const getConfiguredAdapter = async (): Promise<StorageAdapter> => {
  const storeType = await getConfiguredStoreType();

  switch (storeType) {
    case "disk": {
      const { diskConfigFields, createDiskAdapter } = await import(
        "./adapters/disk.ts"
      );
      const config = await loadConfigFromServerVariables(
        diskConfigFields,
        getAsString,
        getAsJson,
      );
      return createDiskAdapter(config.disk_storage_path as string | undefined);
    }
    case "s3":
    case "tigris": {
      const { s3ConfigFields, tigrisConfigFields, createS3Adapter } =
        await import("./adapters/s3.ts");
      const fields = storeType === "tigris" ? tigrisConfigFields : s3ConfigFields;
      const config = await loadConfigFromServerVariables(
        fields,
        getAsString,
        getAsJson,
      );
      return createS3Adapter({
        accessKeyId: config.aws_access_key_id as string,
        secretAccessKey: config.aws_secret_access_key as string,
        region: config.aws_region as string,
        bucketName: config.s3_bucket_name as string,
        endpoint: config.aws_endpoint_url_s3 as string | undefined,
      });
    }
    case "gcp": {
      const { gcpConfigFields, createGCPAdapter } = await import(
        "./adapters/gcp.ts"
      );
      const config = await loadConfigFromServerVariables(
        gcpConfigFields,
        getAsString,
        getAsJson,
      );
      return createGCPAdapter({
        serviceAccount: config.gcp_service_account as Record<string, unknown>,
        bucketName: config.gcp_bucket_name as string,
      });
    }
    case "azure": {
      const { azureConfigFields, createAzureAdapter } = await import(
        "./adapters/azure.ts"
      );
      const config = await loadConfigFromServerVariables(
        azureConfigFields,
        getAsString,
        getAsJson,
      );
      return createAzureAdapter({
        connectionString: config.azure_storage_connection_string as string,
        containerName: config.azure_container_name as string,
      });
    }
  }
};
