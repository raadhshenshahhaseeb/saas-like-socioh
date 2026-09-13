import { proxyCatalog } from "@/lib/server/catalog-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyCatalog(request, `/v1/catalog/runs/${id}`);
}
