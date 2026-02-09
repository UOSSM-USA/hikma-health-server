import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import Token from "@/models/token";
import User from "@/models/user";
import UserClinicPermissions from "@/models/user-clinic-permissions";
import { Option, pipe } from "effect";
import type Clinic from "@/models/clinic";

/**
 * Context available to all tRPC procedures.
 * Created per-request in the fetch handler.
 */
export type TRPCContext = {
  /** Raw Authorization header value, if present */
  authHeader: string | null;
};

/**
 * Authenticated context added by the authed middleware.
 */
type AuthedContext = {
  userId: string;
  role: typeof User.RoleSchema.Type;
  permissions: Record<Clinic.EncodedT["id"], UserClinicPermissions.EncodedT>;
};

/** Build context from the incoming request */
export function createTRPCContext(request: Request): TRPCContext {
  const authHeader = request.headers.get("Authorization");
  return { authHeader };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/**
 * Middleware that validates a Bearer token and attaches user info to context.
 * Rejects with UNAUTHORIZED if the token is missing or invalid.
 */
const authedMiddleware = t.middleware(async ({ ctx, next }) => {
  const { authHeader } = ctx;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Empty bearer token",
    });
  }

  const caller = await Token.getUser(token);
  const user = Option.getOrNull(caller);

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired token",
    });
  }

  const userId: string = user.id;
  const role = user.role;

  const permissionsArray = await UserClinicPermissions.API.getByUser(userId);
  const permissions = permissionsArray.reduce(
    (acc, permission) => {
      acc[permission.clinic_id] = permission;
      return acc;
    },
    {} as Record<Clinic.EncodedT["id"], UserClinicPermissions.EncodedT>,
  );

  return next({
    ctx: { userId, role, permissions } satisfies AuthedContext,
  });
});

/** Procedure that requires a valid Bearer token */
export const authedProcedure = t.procedure.use(authedMiddleware);
