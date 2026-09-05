import { getAddress, type Address } from "viem";
import { LEOPOLD_SEPOLIA_RPC_URL, LEOPOLD_SEPOLIA_RPC_URLS } from "./network";

/**
 * Preview-only wiring for the project-owner's adopted V2 Sepolia topology.
 *
 * This file is intentionally separate from config/leopold-frontend-contracts.json:
 * that manifest is the historical V1 frontend configuration and is not replaced
 * by the visual preview.
 */
export const V2_PREVIEW_RPC_URL = LEOPOLD_SEPOLIA_RPC_URL;
export const V2_PREVIEW_RPC_URLS = LEOPOLD_SEPOLIA_RPC_URLS;
export const V2_PREVIEW_CHAIN_ID = 11_155_111;
export const V2_PREVIEW_CANDIDATE_SHA = "d6ebae63cec660fc5f11bd84e4b581980d3e12f7";
export const V2_PREVIEW_ADOPTION_CHECKPOINT = "92dd90ad0d20e68e114cdafc3bc4e496a43ff7af";
export const V2_PREVIEW_SG4_BINDING_DIGEST = "c219d034aa295a7abe5584dc0b9f5f4c8738e53733d64afc9fb0cde0e6f5be3c";

export const V2_PREVIEW_ADDRESSES = {
  wrapper: getAddress("0x3AD7490852eA0cf16F654Ce854B87227b4369b91"),
  vault: getAddress("0x511c8ac93BC285662B9dbDF65a0a9E2Fb11e8c86"),
  adapter: getAddress("0xaF86E3a111DEE690Fa37b986D5F777689488938d"),
  escrow: getAddress("0x18F5C545D7f18350BEf44aC5C34D55B7C3b95E80"),
  usdc: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
  comet: getAddress("0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e"),
} as const satisfies Record<string, Address>;

export const V2_PREVIEW_CADENCE = {
  name: "Daily",
  roundDurationSeconds: 86_400,
  label: "Daily · 24 hour rounds",
} as const;

export const V2_PREVIEW_RUNTIME_HASHES = {
  vault: "e3156c5a240ce31d15c832389feb74026f6078d4d1494e27d3dd58bac624ba50",
  escrow: "2a0e45b85ce6298747f8dd5a8a1852e22d05079d8fd2761e01e3443e685df605",
} as const;
