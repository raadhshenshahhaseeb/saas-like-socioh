import { proxyCatalog } from "@/lib/server/catalog-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return proxyCatalog(request, "/v1/catalog/runs"); }
