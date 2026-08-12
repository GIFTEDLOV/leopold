import { notFound } from "next/navigation";
import { VaultDetail } from "@/components/vault-detail";
import { getVaultConfig, type VaultId } from "@/lib/leopold/config";

export default async function VaultPage({ params }: { params: Promise<{ vault: string }> }) {
  const { vault } = await params;
  if (!getVaultConfig(vault)) notFound();
  return <VaultDetail slug={vault as VaultId} />;
}
