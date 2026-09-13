import { connection } from "next/server";
import { CatalogWorkflow } from "@/components/catalog-workflow";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const query = await searchParams;
  const run = typeof query.run === "string" ? query.run : query.run ? "invalid" : null;
  return <CatalogWorkflow initialRunId={run} />;
}
