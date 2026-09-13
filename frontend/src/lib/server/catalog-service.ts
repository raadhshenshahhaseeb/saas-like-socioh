import "server-only";
import { createCatalogProxy, transportError } from "./catalog-proxy";

type SharedProxy = ReturnType<typeof createCatalogProxy>;
const shared = globalThis as typeof globalThis & { catalogProxy?: SharedProxy };

export async function proxyCatalog(request: Request, path: string): Promise<Response> {
  try {
    if (!shared.catalogProxy) {
      const development = process.env.NODE_ENV === "development";
      const appOrigin = process.env.APP_ORIGIN ?? (development ? "http://127.0.0.1:3000" : "");
      const goApiUrl = process.env.GO_API_URL ?? (development ? "http://127.0.0.1:8080" : "");
      if (!appOrigin || !goApiUrl) throw new Error("Missing server configuration");
      shared.catalogProxy = createCatalogProxy({ appOrigin, goApiUrl });
    }
    return await shared.catalogProxy(request, path);
  } catch {
    return transportError(503, "service_unavailable", "The catalog service is not ready.");
  }
}
