const DYNAMIC_DEFAULT_API_BASE_URL = "https://app.dynamicauth.com/api/v0";
const ZAMA_RELAYER_KEY_METADATA_URL = "https://relayer.testnet.zama.org/v2/keyurl";
const LEOPOLD_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

function httpsOrigin(value: string | undefined, fallback: string): string {
  try {
    const parsed = new URL(value || fallback);
    return parsed.protocol === "https:" ? parsed.origin : new URL(fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

export function buildContentSecurityPolicy(dynamicApiBaseUrl = process.env.NEXT_PUBLIC_DYNAMIC_API_BASE_URL): string {
  const dynamicApiOrigin = httpsOrigin(dynamicApiBaseUrl, DYNAMIC_DEFAULT_API_BASE_URL);
  const rpcOrigin = new URL(LEOPOLD_SEPOLIA_RPC_URL).origin;
  const zamaOrigin = new URL(ZAMA_RELAYER_KEY_METADATA_URL).origin;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // Next.js hydration emits inline bootstrap scripts. Zama's embedded WASM
    // needs wasm-unsafe-eval; general unsafe-eval is intentionally omitted.
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://app.dynamic.xyz",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${rpcOrigin} ${zamaOrigin} https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com ${dynamicApiOrigin} https://app.dynamic.xyz https://*.dynamic.xyz https://*.dynamicauth.com https://relay.walletconnect.com wss://relay.walletconnect.com https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org`,
    "frame-src 'self' https://app.dynamic.xyz https://*.dynamic.xyz https://*.dynamicauth.com https://verify.walletconnect.com",
    "manifest-src 'self'",
  ].join("; ");
}

export const securityHeaders = [
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
] as const;
