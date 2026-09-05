import { notFound } from "next/navigation";
import { ClassicVaultDetailSitesPage } from "@/components/final-ui/classic-sites-v165";
import { getVaultConfig, type VaultId } from "@/lib/leopold/config";

export default async function ClassicVaultPage({ params }: { params: Promise<{ vault: string }> }) {
  const { vault } = await params;
  if (!getVaultConfig(vault)) notFound();
  return <ClassicVaultDetailSitesPage slug={vault as VaultId} />;
}
