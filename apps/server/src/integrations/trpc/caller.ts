import { TRPCError } from "@trpc/server";
import User from "@/models/user";
import Clinic from "@/models/clinic";
import Device from "@/models/device";
import { Option } from "@/lib/option";
import { Logger } from "@hikmahealth/js-utils";
import type { RequestCaller } from "@/types";
import type { AuthedContext } from "./init";

/**
 * Build a `RequestCaller` suitable for Sync methods from tRPC auth context.
 *
 * The RPC caller is always an authenticated user (via JWT), not a device, so
 * there is no device record to attach — clinic scoping falls back to the user's
 * own clinic.
 */
export async function callerFromContext(
  ctx: AuthedContext,
): Promise<RequestCaller> {
  const user = await User.API.getById(ctx.userId);
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not found",
    });
  }

  let clinic: Option<Clinic.EncodedT> = Option.none;
  if (user.clinic_id) {
    try {
      const c = await Clinic.getById(user.clinic_id);
      clinic = Option.some(c);
    } catch {
      // Clinic may not exist — proceed without it
    }
  }

  return { user, clinic, token: "" };
}

/**
 * The peer type a sync request may actually be served as.
 *
 * `peer_type` arrives in the request body, and `sync_hub` is not a label — it
 * selects a wider entity set in both directions. Server → client it adds
 * `users`, `devices` and `device_pin_codes`; client → server it adds
 * `clinic_departments`, `drug_catalogue` and `device_pin_codes`. Worse, both
 * scoping paths key off `"device" in caller`: a hub claim from a caller with no
 * device record yields `clinicIds = null`, which turns `applyClinicScope` and
 * the per-record clinic check into no-ops. So an unchecked claim reads every
 * clinic's users and devices, and `device_pin_codes.pin_hash` is an unsalted
 * SHA-256 of a six-digit PIN — a keyspace of 10^6, recoverable instantly.
 *
 * `/api/v2/sync` already refuses this: a `sync_hub` claim there must present a
 * device API key, and the caller it builds is the resolved device. This is the
 * same rule for the RPC surface, which had none.
 *
 * Today it always denies, because `callerFromContext` authenticates a JWT user
 * and never attaches a device — and the real hub syncs over `/api/v2/sync`, not
 * over tRPC, so nothing legitimate is refused. It is written as a capability
 * check rather than an unconditional throw so it stays correct if a
 * device-authenticated caller ever reaches these procedures.
 */
export function resolvePeerType(
  requested: string | undefined,
  caller: RequestCaller,
): Device.DeviceTypeT {
  const peerType = (requested ?? "unknown") as Device.DeviceTypeT;
  if (peerType !== Device.DEVICE_TYPE.SYNC_HUB) return peerType;

  const isHubDevice =
    "device" in caller &&
    caller.device?.device_type === Device.DEVICE_TYPE.SYNC_HUB;

  if (!isHubDevice) {
    // Logged rather than left to the error path: the TRPCError is thrown before
    // the procedures' try blocks, so nothing else records it — and a caller
    // asking to be served as a hub is worth seeing.
    Logger.warn({
      msg: "[sync] Refused a sync_hub peer_type claim from a non-device caller",
      caller: "user" in caller ? caller.user.id : "device",
    });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "sync_hub peer type requires device API key authentication",
    });
  }
  return peerType;
}
