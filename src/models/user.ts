import db from "@/db";
import { Either, Option, Schema } from "effect";
import {
  type ColumnType,
  type Generated,
  type Selectable,
  type Insertable,
  type Updateable,
  type JSONColumnType,
  sql,
} from "kysely";
import Token from "./token";
import bcrypt from "bcrypt";
import { serverOnly } from "@tanstack/react-start";
import { v1 as uuidV1 } from "uuid";
import UserClinicPermissions from "./user-clinic-permissions";

namespace User {
  // export type T = {
  //   id: string;
  //   name: string;
  //   role: string;
  //   email: string;
  //   hashed_password: string;
  //   instance_url: Option.Option<string>;
  //   clinic_id: Option.Option<string>;
  //   is_deleted: boolean;
  //   created_at: Date;
  //   updated_at: Date;
  //   last_modified: Date;
  //   server_created_at: Date;
  //   deleted_at: Option.Option<Date>;
  // };

  export const ROLES = {
    REGISTRAR: "registrar",
    PROVIDER: "provider",
    ADMIN: "admin",
    SUPER_ADMIN_2: "super_admin_2",
    SUPER_ADMIN: "super_admin",
    PROJECT_MANAGER: "project_manager",
    TECHNICAL_ADVISOR: "technical_advisor",
    TEAM_LEADER: "team_leader",
    ME_OFFICER: "me_officer",
    IM_ASSOCIATE: "im_associate",
    CASEWORKER_1: "caseworker_1",
    CASEWORKER_2: "caseworker_2",
    CASEWORKER_3: "caseworker_3",
    CASEWORKER_4: "caseworker_4",
  };

  export const roles = [
    ROLES.REGISTRAR,
    ROLES.PROVIDER,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN_2,
    ROLES.SUPER_ADMIN,
    ROLES.PROJECT_MANAGER,
    ROLES.TECHNICAL_ADVISOR,
    ROLES.TEAM_LEADER,
    ROLES.ME_OFFICER,
    ROLES.IM_ASSOCIATE,
    ROLES.CASEWORKER_1,
    ROLES.CASEWORKER_2,
    ROLES.CASEWORKER_3,
    ROLES.CASEWORKER_4,
  ] as const;

  export const RoleSchema = Schema.Union(
    Schema.Literal(ROLES.REGISTRAR),
    Schema.Literal(ROLES.PROVIDER),
    Schema.Literal(ROLES.ADMIN),
    Schema.Literal(ROLES.SUPER_ADMIN_2),
    Schema.Literal(ROLES.SUPER_ADMIN),
    Schema.Literal(ROLES.PROJECT_MANAGER),
    Schema.Literal(ROLES.TECHNICAL_ADVISOR),
    Schema.Literal(ROLES.TEAM_LEADER),
    Schema.Literal(ROLES.ME_OFFICER),
    Schema.Literal(ROLES.IM_ASSOCIATE),
    Schema.Literal(ROLES.CASEWORKER_1),
    Schema.Literal(ROLES.CASEWORKER_2),
    Schema.Literal(ROLES.CASEWORKER_3),
    Schema.Literal(ROLES.CASEWORKER_4),
  );

  export type RoleT = typeof RoleSchema.Encoded;

  /**
   * Role hierarchy levels - higher numbers have more authority
   * This hierarchy prevents lower-level users from managing higher-level users
   */
  export const ROLE_HIERARCHY: Record<typeof RoleSchema.Type, number> = {
    registrar: 1,      // Can only register patients
    provider: 2,       // Can manage patients
    caseworker_1: 2,   // Caseworker levels treated like providers
    caseworker_2: 2,
    caseworker_3: 2,
    caseworker_4: 2,
    admin: 3,          // Can manage clinic users and patients
    project_manager: 3,
    technical_advisor: 3,
    team_leader: 3,
    me_officer: 3,
    im_associate: 3,
    super_admin_2: 4,  // Full system access (no delete)
    super_admin: 5,    // Full system access with delete
  };

  /**
   * Check if an actor role can manage a target role
   * @param actorRole - The role of the user attempting the action
   * @param targetRole - The role of the user being managed
   * @returns true if actor can manage target, false otherwise
   */
  export function canManageRole(
    actorRole: typeof RoleSchema.Type,
    targetRole: typeof RoleSchema.Type,
  ): boolean {
    // Only admins, super_admin_2, and super_admins can manage users
    if (
      actorRole !== ROLES.ADMIN &&
      actorRole !== ROLES.SUPER_ADMIN_2 &&
      actorRole !== ROLES.SUPER_ADMIN
    ) {
      return false;
    }
    
    // Super admins can manage everyone
    if (actorRole === ROLES.SUPER_ADMIN) {
      return true;
    }
    
    // Super Admin 2 can manage everyone except super_admin
    if (actorRole === ROLES.SUPER_ADMIN_2 && targetRole !== ROLES.SUPER_ADMIN) {
      return true;
    }
    
    // Admins can manage everyone except super_admin_2 and super_admins
    if (
      actorRole === ROLES.ADMIN &&
      targetRole !== ROLES.SUPER_ADMIN &&
      targetRole !== ROLES.SUPER_ADMIN_2
    ) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if an actor role can delete a target role
   * @param actorRole - The role of the user attempting the deletion
   * @param targetRole - The role of the user being deleted
   * @returns true if actor can delete target, false otherwise
   */
  export function canDeleteRole(
    actorRole: typeof RoleSchema.Type,
    targetRole: typeof RoleSchema.Type,
  ): boolean {
    // Only super admins can delete users
    if (actorRole !== ROLES.SUPER_ADMIN) {
      return false;
    }
    
    // Super admins can delete anyone except other super admins (to prevent system lockout)
    // This is a safety measure - super admins should be managed carefully
    return true; // Allow super admin to delete other super admins, but UI will prevent self-deletion
  }

  /**
   * Check if an actor role can create a user with a target role
   * @param actorRole - The role of the user attempting to create
   * @param targetRole - The role being assigned to the new user
   * @returns true if actor can create user with target role, false otherwise
   */
  export function canCreateRole(
    actorRole: typeof RoleSchema.Type,
    targetRole: typeof RoleSchema.Type,
  ): boolean {
    // Super admins can create any role
    if (actorRole === ROLES.SUPER_ADMIN) {
      return true;
    }
    
    // Super Admin 2 can create any role except super_admin
    if (actorRole === ROLES.SUPER_ADMIN_2 && targetRole !== ROLES.SUPER_ADMIN) {
      return true;
    }
    
    // Admins can create roles lower than super_admin_2
    if (
      actorRole === ROLES.ADMIN &&
      targetRole !== ROLES.SUPER_ADMIN &&
      targetRole !== ROLES.SUPER_ADMIN_2
    ) {
      return true;
    }
    
    // Providers and registrars cannot create users
    return false;
  }

  /**
   * Check if an actor role can update a target role
   * @param actorRole - The role of the user attempting the update
   * @param targetRole - The current role of the user being updated
   * @param newRole - The new role being assigned (optional)
   * @returns true if actor can update target, false otherwise
   */
  export function canUpdateUser(
    actorRole: typeof RoleSchema.Type,
    targetRole: typeof RoleSchema.Type,
    newRole?: typeof RoleSchema.Type,
  ): boolean {
    // Only admins and super_admins can update users
    if (actorRole !== ROLES.ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      return false;
    }
    
    // Check if actor can manage the current role
    if (!canManageRole(actorRole, targetRole)) {
      return false;
    }
    
    // If changing role, check if actor can assign the new role
    if (newRole && newRole !== targetRole) {
      return canCreateRole(actorRole, newRole);
    }
    
    return true;
  }

  export const UserSchema = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    role: RoleSchema,
    email: Schema.String,
    hashed_password: Schema.String,
    instance_url: Schema.OptionFromNullOr(Schema.String),
    clinic_id: Schema.OptionFromNullOr(Schema.String),
    is_deleted: Schema.Boolean,
    created_at: Schema.Union(
      Schema.DateFromString,
      Schema.Date,
      Schema.DateFromSelf,
    ),
    updated_at: Schema.Union(
      Schema.Date,
      Schema.DateFromString,
      Schema.DateFromSelf,
    ),
    last_modified: Schema.Union(
      Schema.Date,
      Schema.DateFromString,
      Schema.DateFromSelf,
    ),
    server_created_at: Schema.Union(
      Schema.Date,
      Schema.DateFromString,
      Schema.DateFromSelf,
    ),
    deleted_at: Schema.OptionFromNullOr(
      Schema.Union(Schema.Date, Schema.DateFromString),
    ),
  });

  export type T = typeof UserSchema.Type;
  export type EncodedT = typeof UserSchema.Encoded;

  // TODO: To add capabilities in prod, we need a new table and migration
  export const CapabilitySchema = Schema.Union(
    // Manage other users
    Schema.Literal("create_user"),
    Schema.Literal("read_user"),
    Schema.Literal("update_user"),
    Schema.Literal("delete_user"),

    // Manage patients
    Schema.Literal("create_patient"),
    Schema.Literal("read_patient"),
    Schema.Literal("update_patient"),
    Schema.Literal("delete_patient"),

    // Manage all patients (including other clinics and departments)
    Schema.Literal("create_all_patient"),
    Schema.Literal("read_all_patient"),
    Schema.Literal("update_all_patient"),
    Schema.Literal("delete_all_patient"),

    // Manage clinics
    Schema.Literal("create_clinic"),
    Schema.Literal("read_clinic"),
    Schema.Literal("update_clinic"),
    Schema.Literal("delete_clinic"),

    // Manage system
    Schema.Literal("manage_system"),
    Schema.Literal("view_analytics"),
    Schema.Literal("manage_permissions"),

    // Manage reports
    Schema.Literal("create_report"),
    Schema.Literal("read_report"),
    Schema.Literal("update_report"),
    Schema.Literal("delete_report"),
  );

  export const CAPABILITIES: Record<string, typeof CapabilitySchema.Type> = {
    // User management
    CREATE_USER: "create_user",
    READ_USER: "read_user",
    UPDATE_USER: "update_user",
    DELETE_USER: "delete_user",

    // Clinic Patient management
    CREATE_PATIENT: "create_patient",
    READ_PATIENT: "read_patient",
    UPDATE_PATIENT: "update_patient",
    DELETE_PATIENT: "delete_patient",

    // All Clinics patient management
    CREATE_ALL_PATIENT: "create_all_patient",
    READ_ALL_PATIENT: "read_all_patient",
    UPDATE_ALL_PATIENT: "update_all_patient",
    DELETE_ALL_PATIENT: "delete_all_patient",

    // Clinic management
    CREATE_CLINIC: "create_clinic",
    READ_CLINIC: "read_clinic",
    UPDATE_CLINIC: "update_clinic",
    DELETE_CLINIC: "delete_clinic",

    // System administration
    MANAGE_SYSTEM: "manage_system",
    VIEW_ANALYTICS: "view_analytics",
    MANAGE_PERMISSIONS: "manage_permissions",

    // Report operations
    CREATE_REPORT: "create_report",
    READ_REPORT: "read_report",
    UPDATE_REPORT: "update_report",
    DELETE_REPORT: "delete_report",
  };

  const ADMIN_CAPABILITIES = [
    CAPABILITIES.CREATE_USER,
    CAPABILITIES.READ_USER,
    CAPABILITIES.UPDATE_USER,
    CAPABILITIES.DELETE_USER,

    // Clinic Patient management
    CAPABILITIES.CREATE_PATIENT,
    CAPABILITIES.READ_PATIENT,
    CAPABILITIES.UPDATE_PATIENT,
    CAPABILITIES.DELETE_PATIENT,

    // All Clinics patient management
    CAPABILITIES.CREATE_ALL_PATIENT,
    CAPABILITIES.READ_ALL_PATIENT,
    CAPABILITIES.UPDATE_ALL_PATIENT,
    CAPABILITIES.DELETE_ALL_PATIENT,

    // Clinic management
    CAPABILITIES.CREATE_CLINIC,
    CAPABILITIES.READ_CLINIC,
    CAPABILITIES.UPDATE_CLINIC,
    CAPABILITIES.DELETE_CLINIC,

    // System administration
    CAPABILITIES.MANAGE_SYSTEM,
    CAPABILITIES.VIEW_ANALYTICS,
    CAPABILITIES.MANAGE_PERMISSIONS,
    CAPABILITIES.CREATE_REPORT,
    CAPABILITIES.READ_REPORT,
    CAPABILITIES.UPDATE_REPORT,
    CAPABILITIES.DELETE_REPORT,
  ];

  export const ROLE_CAPABILITIES: Record<
    typeof User.RoleSchema.Type,
    (typeof CapabilitySchema.Type)[]
  > = {
    registrar: [
      CAPABILITIES.CREATE_PATIENT,
      CAPABILITIES.READ_PATIENT,
      CAPABILITIES.UPDATE_PATIENT,
    ],
    admin: [...ADMIN_CAPABILITIES],
    provider: [
      CAPABILITIES.READ_USER,
      CAPABILITIES.CREATE_PATIENT,
      CAPABILITIES.READ_PATIENT,
      CAPABILITIES.UPDATE_PATIENT,
      CAPABILITIES.DELETE_PATIENT,
      CAPABILITIES.CREATE_REPORT,
      CAPABILITIES.READ_REPORT,
      CAPABILITIES.UPDATE_REPORT,
    ],
    // Caseworkers have READ_PATIENT capability to view patients
    caseworker_1: [
      CAPABILITIES.CREATE_PATIENT,
      CAPABILITIES.READ_PATIENT,
      CAPABILITIES.UPDATE_PATIENT,
    ],
    caseworker_2: [
      CAPABILITIES.CREATE_PATIENT,
      CAPABILITIES.READ_PATIENT,
      CAPABILITIES.UPDATE_PATIENT,
    ],
    caseworker_3: [
      CAPABILITIES.CREATE_PATIENT,
      CAPABILITIES.READ_PATIENT,
      CAPABILITIES.UPDATE_PATIENT,
    ],
    caseworker_4: [
      CAPABILITIES.CREATE_PATIENT,
      CAPABILITIES.READ_PATIENT,
      CAPABILITIES.UPDATE_PATIENT,
    ],
    // Full access roles have admin capabilities
    team_leader: [...ADMIN_CAPABILITIES],
    technical_advisor: [...ADMIN_CAPABILITIES],
    project_manager: [...ADMIN_CAPABILITIES],
    me_officer: [...ADMIN_CAPABILITIES],
    im_associate: [...ADMIN_CAPABILITIES],
    super_admin_2: [...ADMIN_CAPABILITIES],
    super_admin: [...ADMIN_CAPABILITIES],
  };

  export function secureMask(user: User.T): User.T {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      hashed_password: "***************",
      instance_url: Option.none(),
      clinic_id: Option.none(),
      is_deleted: user.is_deleted,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_modified: user.last_modified,
      server_created_at: user.server_created_at,
      deleted_at: user.deleted_at,
    };
  }

  export function getInitials(user: User.T | User.EncodedT): string {
    if (!user.name || typeof user.name !== "string" || user.name.trim().length === 0) {
      // Return initials from email if name is not available
      if (user.email && typeof user.email === "string") {
        const emailParts = user.email.split("@")[0].split(/[._-]/);
        return emailParts
          .filter(part => part.length > 0)
          .map((part) => part[0]?.toUpperCase() || "")
          .slice(0, 2)
          .join("") || "U";
      }
      return "U"; // Default fallback
    }
    
    const nameParts = user.name.trim().split(" ").filter(part => part.length > 0);
    if (nameParts.length === 0) {
      return "U"; // Fallback if name is empty after trimming
    }
    
    return nameParts
      .map((name) => name[0]?.toUpperCase() || "")
      .filter(char => char.length > 0)
      .slice(0, 2) // Limit to first 2 initials
      .join("") || "U";
  }

  export const fromDbEntry = (
    dbUser: User.Table.Users,
  ): Either.Either<User.T, Error> => {
    return Schema.decodeUnknownEither(UserSchema)(dbUser);
  };

  export namespace Table {
    /**
     * If set to true, this table is always pushed regardless of the the last sync date times. All sync events push to mobile the latest table.
     * IMPORTANT: If ALWAYS_PUSH_TO_MOBILE is true, content of the table should never be edited on the client or pushed to the server from mobile. its one way only.
     * */
    export const ALWAYS_PUSH_TO_MOBILE = false;
    export const name = "users";
    /** The name of the table in the mobile database */
    export const mobileName = "users";
    export const columns = {
      id: "id",
      name: "name",
      role: "role",
      email: "email",
      hashed_password: "hashed_password",
      instance_url: "instance_url",
      clinic_id: "clinic_id",
      is_deleted: "is_deleted",
      metadata: "metadata",
      created_at: "created_at",
      updated_at: "updated_at",
      last_modified: "last_modified",
      server_created_at: "server_created_at",
      deleted_at: "deleted_at",
    };

    export interface T {
      id: string;
      name: string;
      role: string;
      email: string;
      hashed_password: string;
      instance_url: string | null;
      clinic_id: string | null;
      is_deleted: Generated<boolean>;
      metadata: JSONColumnType<Record<string, any>>;
      created_at: Generated<ColumnType<Date, string | undefined, never>>;
      updated_at: Generated<
        ColumnType<Date, string | undefined, string | undefined>
      >;
      last_modified: Generated<ColumnType<Date, string | undefined, never>>;
      server_created_at: Generated<ColumnType<Date, string | undefined, never>>;
      deleted_at: ColumnType<
        Date | null,
        string | null | undefined,
        string | null
      >;
    }

    export type Users = Selectable<T>;
    export type NewUsers = Insertable<T>;
    export type UsersUpdate = Updateable<T>;
  }

  /**
   * Authenticate a user by signing them in using an email and password
   * The method also creates a token for the user, with an expiry date 2 hours in the future
   * @param {string} email - The user's email
   * @param {string} password - The user's password
   * @param {number} validHours - The number of hours the token is valid for
   * @returns {Promise<{ user: User.EncodedT; token: string }>} - The user if authentication is successful, null otherwise
   */
  export const signIn = serverOnly(
    async (
      email: string,
      password: string,
      validHours: number = 2,
    ): Promise<{ user: User.EncodedT; token: string }> => {
      // Use case-insensitive email matching
      const user = await db
        .selectFrom(Table.name)
        .where(sql`LOWER(${sql.id(Table.name)}.email)`, "=", email.toLowerCase())
        .where("is_deleted", "=", false)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        throw new Error("User not found");
      }

      const hashedPassword = user.hashed_password;
      if (!(await bcrypt.compare(password, hashedPassword))) {
        throw new Error("Invalid password");
      }

      const userEntry = User.fromDbEntry(user);
      if (Either.isLeft(userEntry)) {
        throw new Error("Failed to parse user data");
      }

      const token = await Token.create(
        user.id,
        new Date(Date.now() + validHours * 60 * 60 * 1000),
      );

      return {
        user: Schema.encodeSync(UserSchema)(userEntry.right),
        token,
      };
    },
  );

  /**
   * Signs a user out and invalidates their token
   * @param {string} token - The user's token
   * @returns {Promise<void>} - Resolves when the token is invalidated
   */
  export const signOut = serverOnly(async (token: string): Promise<void> => {
    await Token.invalidate(token);
  });

  export namespace API {
    /**
     * Create a new user / registration
     * @param {User.EncodedT} user - The user to create
     * @returns {Promise<User.EncodedT["id"] | null>} - The created user
     */
    export const create = serverOnly(
      async (
        user: User.EncodedT,
        creatorId: string,
      ): Promise<User.EncodedT["id"] | null> => {
        const entry = User.fromDbEntry(user);
        if (Either.isLeft(entry)) return null;

        const saltRounds = 10;
        const salt = bcrypt.genSaltSync(saltRounds);
        const hash = bcrypt.hashSync(user.hashed_password, salt);

        const userId = uuidV1();

        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto(Table.name)
            .values({
              id: userId,
              name: user.name,
              role: user.role,
              email: user.email,
              hashed_password: hash,
              instance_url: user.instance_url,
              clinic_id: user.clinic_id,
              is_deleted: user.is_deleted,
              updated_at: sql`now()`,
              last_modified: sql`now()`,
              server_created_at: sql`now()`,
              deleted_at: null,
              created_at: sql`now()`,
            })
            .execute();

          const userPermissions = UserClinicPermissions.getRolePermissions(
            user.role,
          );
          await trx
            .insertInto(UserClinicPermissions.Table.name)
            .values({
              user_id: userId,
              clinic_id: user.clinic_id || "",
              can_delete_records: userPermissions.can_delete_records,
              can_view_history: userPermissions.can_view_history,
              can_edit_records: userPermissions.can_edit_records,
              can_register_patients: userPermissions.can_register_patients,
              is_clinic_admin: userPermissions.is_clinic_admin,
              created_by: creatorId,
              created_at: sql`now()`,
              updated_at: sql`now()`,
              last_modified_by: creatorId,
            })
            .execute();
        });

        return userId;
      },
    );
    /**
     * Get all users
     * @returns {Promise<User.EncodedT[]>} - The list of users
     */
    export const getAll = serverOnly(async (): Promise<User.EncodedT[]> => {
      const users = await db
        .selectFrom(Table.name)
        .where("is_deleted", "=", false)
        .selectAll()
        .execute();

      const entries = users.map(User.fromDbEntry);

      // Throws an error if encoding fails. Something to keep in mind!
      return entries
        .filter(Either.isRight)
        .map((e) => Schema.encodeSync(UserSchema)(e.right));
    });

    /**
     * get a user by their id
     * @param {string} id - The id of the user
     * @returns {Promise<User.EncodedT | null>} - The user
     */
    export const getById = serverOnly(
      async (id: string): Promise<User.EncodedT | null> => {
        const user = await db
          .selectFrom(Table.name)
          .where("id", "=", id)
          .where("is_deleted", "=", false)
          .selectAll()
          .executeTakeFirst();

        if (user === null) return null;

        const entry = User.fromDbEntry(user);
        if (Either.isLeft(entry)) return null;

        return Schema.encodeSync(UserSchema)(entry.right);
      },
    );

    /**
     * retrieve all users with a first name "james"
     * @param {string} name - The first name of the user
     * @returns {Promise<User.EncodedT[]>} - The list of users
     */
    export const getByName = serverOnly(
      async (name: string): Promise<User.EncodedT[]> => {
        const users = await db
          .selectFrom(Table.name)
          .where("name", "=", name)
          .where("is_deleted", "=", false)
          .selectAll()
          .execute();

        return users
          .map(User.fromDbEntry)
          .filter(Either.isRight)
          .map((e) => Schema.encodeSync(UserSchema)(e.right));
      },
    );

    export const update = serverOnly(
      async (
        id: string,
        user: Omit<
          User.EncodedT,
          | "hashed_password"
          | "created_at"
          | "updated_at"
          | "last_modified"
          | "server_created_at"
          | "deleted_at"
        >,
      ): Promise<User.EncodedT["id"] | null> => {
        await db
          .updateTable(Table.name)
          .set({
            name: user.name,
            role: user.role,
            email: user.email,
            instance_url: user.instance_url,
            clinic_id: user.clinic_id,
            is_deleted: user.is_deleted,
            updated_at: sql`now()`,
            last_modified: sql`now()`,
          })
          .where("id", "=", id)
          .execute();

        return id;
      },
    );

    // Specific methods to update passwords
    export const updatePassword = serverOnly(
      async (id: string, password: string): Promise<User.EncodedT["id"]> => {
        await db
          .updateTable(Table.name)
          .set({
            hashed_password: password,
            updated_at: sql`now()`,
            last_modified: sql`now()`,
          })
          .where("id", "=", id)
          .execute();

        return id;
      },
    );

    export const softDelete = serverOnly(async (id: string): Promise<void> => {
      await db
        .updateTable(Table.name)
        .set({ is_deleted: true })
        .where("id", "=", id)
        .execute();
    });
  }
}

export default User;
