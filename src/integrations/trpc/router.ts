import type { TRPCRouterRecord } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "./init";
import { patientsRouter } from "./routers/patients";
import { visitsRouter } from "./routers/visits";
import { eventsRouter } from "./routers/events";

/** Demo router — kept for the existing demo page at /demo/tanstack-query */
const peopleRouter = {
  list: publicProcedure.query(async () => [
    { name: "John Doe" },
    { name: "Jane Doe" },
  ]),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
  people: peopleRouter,
  patients: patientsRouter,
  visits: visitsRouter,
  events: eventsRouter,
});

export type TRPCRouter = typeof trpcRouter;
