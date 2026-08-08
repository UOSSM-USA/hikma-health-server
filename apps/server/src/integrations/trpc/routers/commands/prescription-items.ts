/**
 * Prescription item command procedures (nested under `prescription_items.*`).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedProcedure, createTRPCRouter } from "../../init";
import { flexTimestamp, flexTimestampOptional } from "@/lib/rpc-utils";

export const prescriptionItemsCommandRouter = createTRPCRouter({
  /** Create a new prescription item (upsert on id conflict). */
  create: authedProcedure
    .input(
      z.object({
        id: z.string().nullish(),
        prescription_id: z.string(),
        patient_id: z.string(),
        drug_id: z.string(),
        clinic_id: z.string(),
        dosage_instructions: z.string(),
        quantity_prescribed: z.number().int(),
        quantity_dispensed: z.number().int().nullish(),
        refills_authorized: z.number().int().nullish(),
        refills_used: z.number().int().nullish(),
        item_status: z.string().nullish(),
        notes: z.string().nullish(),
        metadata: z.string().nullish(),
        created_at: flexTimestamp,
        updated_at: flexTimestamp,
      }),
    )
    .mutation(async () => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "prescription_items.create: not yet implemented",
      });
    }),

  /**
   * Update mutable fields on a prescription item.
   *
   * Only provided (non-undefined) fields are SET. Returns the full item.
   */
  update: authedProcedure
    .input(
      z.object({
        id: z.string(),
        dosage_instructions: z.string().nullish(),
        quantity_prescribed: z.number().int().nullish(),
        quantity_dispensed: z.number().int().nullish(),
        refills_authorized: z.number().int().nullish(),
        refills_used: z.number().int().nullish(),
        item_status: z.string().nullish(),
        notes: z.string().nullish(),
        metadata: z.string().nullish(),
        updated_at: flexTimestampOptional,
      }),
    )
    .mutation(async () => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "prescription_items.update: not yet implemented",
      });
    }),

  /**
   * Dispense a prescription item from one or more inventory batches.
   * Decrements inventory and increments quantity_dispensed.
   *
   * Must run as one transaction: each batch takes SELECT FOR UPDATE on its
   * `clinic_inventory` row before checking stock, or two concurrent dispenses
   * both pass the check and oversell. Insufficient stock in any batch rolls the
   * whole thing back rather than dispensing part of it.
   */
  dispense: authedProcedure
    .input(
      z.object({
        id: z.string(),
        provider_id: z.string(),
        batch_quantities: z.record(z.string(), z.number().int().positive()),
      }),
    )
    .mutation(async () => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "prescription_items.dispense: not yet implemented",
      });
    }),
});
