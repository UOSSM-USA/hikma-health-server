import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import User from "@/models/user";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "@tanstack/react-router";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllClinics } from "@/lib/server-functions/clinics";
import upperFirst from "lodash/upperFirst";
import { getCurrentUserId } from "@/lib/server-functions/auth";
import { toast } from "sonner";
import { v1 as uuidV1 } from "uuid";
import { Either, Schema, Option } from "effect";
import { permissionsMiddleware } from "@/middleware/auth";
import { useTranslation } from "@/lib/i18n/context";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  currentUserHasRole,
  getUserById,
  resetUserPassword,
} from "@/lib/server-functions/users";
import UserClinicPermissions from "@/models/user-clinic-permissions";
import If from "@/components/if";
import { useImmerReducer } from "use-immer";

const updateUser = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      user: Omit<
        User.EncodedT,
        | "hashed_password"
        | "created_at"
        | "updated_at"
        | "last_modified"
        | "server_created_at"
        | "deleted_at"
      >;
    }) => data,
  )
  .middleware([permissionsMiddleware])
  .handler(async ({ data, context }) => {
    if (!context.userId || !context.role) {
      return Promise.reject({
        message: "Unauthorized: Insufficient permissions",
        source: "updateUser",
      });
    }

    // Get the current user data to check their role
    const currentUser = await User.API.getById(data.id);
    if (!currentUser) {
      return Promise.reject({
        message: "User not found",
        source: "updateUser",
      });
    }

    // Check if the actor has permission to update this user's role
    if (!User.canUpdateUser(context.role, currentUser.role, data.user.role)) {
      return Promise.reject({
        message: `Unauthorized: Cannot modify ${currentUser.role} users or assign ${data.user.role} role`,
        source: "updateUser",
      });
    }

    // Check clinic permissions
    await UserClinicPermissions.API.isAuthorizedWithClinic(
      data.user.clinic_id,
      "is_clinic_admin",
    );

    const res = await User.API.update(data.id, data.user);
    return res;
  });

const registerUser = createServerFn({ method: "POST" })
  .validator((data: { user: User.EncodedT; creatorId: string }) => ({
    user: data.user,
    creatorId: data.creatorId,
  }))
  .middleware([permissionsMiddleware])
  .handler(async ({ data, context }) => {
    if (!context.userId || !context.role) {
      return Promise.reject({
        message: "Unauthorized: Insufficient permissions",
        source: "registerUser",
      });
    }

    // Check if the actor has permission to create a user with this role
    if (!User.canCreateRole(context.role, data.user.role)) {
      return Promise.reject({
        message: `Unauthorized: Cannot create ${data.user.role} users. ${context.role} users can only create users with lower privileges.`,
        source: "registerUser",
      });
    }

    // Check clinic permissions
    await UserClinicPermissions.API.isAuthorizedWithClinic(
      data.user.clinic_id,
      "is_clinic_admin",
    );

    // If the user is not super admin, they cannot create a super admin user
    // this if says: if the current user (in context) does not have the role of super admin, and they are trying to register a user with the role super admin, reject.
    if (
      context.role !== User.ROLES.SUPER_ADMIN &&
      data.user.role === User.ROLES.SUPER_ADMIN
    ) {
      return Promise.reject({
        message:
          "Unauthorized: Insufficient permissions. A non super admin cannot create a super admin user",
      });
    }

    const res = await User.API.create(data.user, data.creatorId);
    return res;
  });

const userFormSchema = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  email: Schema.NonEmptyTrimmedString,
  clinic_id: Schema.OptionFromNullOr(Schema.String),
  role: User.RoleSchema,
  password: Schema.OptionFromNullOr(Schema.String),
});

type UserFormValues = typeof userFormSchema.Encoded;

const getCurrentUserRole = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) => {
    return context.role;
  });

export const Route = createFileRoute("/app/users/edit/$")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const userId = params._splat === "new" ? null : params._splat;
    return {
      user: await getUserById({ data: { id: userId } }),
      clinics: await getAllClinics(),
      currentUserId: await getCurrentUserId(),
      currentUserRole: await getCurrentUserRole(),
      isSuperAdmin: await currentUserHasRole({ data: { role: "super_admin" } }),
    };
  },
});

function RouteComponent() {
  const { user, clinics, currentUserId, currentUserRole } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const userId = Route.useParams()._splat;
  const isEditMode = Boolean(userId && user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslation();

  // Filter roles that the current user can assign
  const availableRoles = User.roles.filter((role) => {
    if (!currentUserRole) return false;
    return User.canCreateRole(currentUserRole, role);
  });

  // Initialize form with user data if in edit mode
  const form = useForm<UserFormValues>({
    // resolver: userFormSchema.resolve(userFormSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      role: user?.role || undefined,
      clinic_id: user?.clinic_id || undefined,
      password: "",
    },
  });

  const onSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      if (isEditMode && userId && typeof userId === "string") {
        await updateUser({
          data: { id: userId, user: data as any },
        });
        navigate({ to: "/app/users" });
        toast.success(t("messages.userUpdated"));
      } else {
        const newUser = User.UserSchema.make({
          id: uuidV1(),
          name: data.name,
          role: data.role,
          email: data.email,
          hashed_password: data.password as string,
          instance_url: Option.none(),
          clinic_id: Option.fromNullable(data.clinic_id),
          is_deleted: false,
          updated_at: new Date(),
          last_modified: new Date(),
          server_created_at: new Date(),
          deleted_at: Option.none(),
          created_at: new Date(),
        });
        const res = Schema.encodeUnknownEither(User.UserSchema)(newUser);
        Either.match(res, {
          onLeft: (error) => {
            console.error("Failed to encode user:", error);
            toast.error(t("messages.userCreateError"));
          },
          onRight: (user) => {
            registerUser({
              data: {
                user,
                creatorId: currentUserId || "",
              },
            })
              .then(() => {
                toast.success(t("messages.userCreated"));
                navigate({ to: "/app/users" });
              })
              .catch((error) => {
                console.error("Failed to create user:", error);
                toast.error(error.message);
              });
          },
        });
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error(
        isEditMode
          ? t("messages.userUpdateError")
          : t("messages.userCreateError"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          {isEditMode ? t("userForm.titleEdit") : t("userForm.titleCreate")}
        </h1>
      </div>

      <div className="max-w-xl">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
            autoComplete="off"
            autoSave="off"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("userForm.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("userForm.nameDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.email")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoCapitalize="none"
                      aria-autocomplete="none"
                      autoComplete="off"
                      autoCorrect="off"
                      autoSave="off"
                      placeholder={t("userForm.emailPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("userForm.emailDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clinic_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("forms.clinic")}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("userForm.clinicPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clinics?.map((clinic) => (
                        <SelectItem key={clinic.id} value={clinic.id}>
                          {clinic.name || t("userForm.unnamedClinic")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t("userForm.clinicDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              disabled={currentUserId === userId}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <span>
                      {t("userForm.roleLabel")}{" "}
                      {currentUserId === userId
                        ? t("userForm.roleLockedNote")
                        : ""}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline">?</Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("userForm.roleTooltip.registrar")}</p>
                        <p>{t("userForm.roleTooltip.provider")}</p>
                        <p>{t("userForm.roleTooltip.admin")}</p>
                        <p>{t("userForm.roleTooltip.superAdmin")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={currentUserId === userId}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("userForm.rolePlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {upperFirst(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {availableRoles.length === 0
                      ? t("userForm.roleNoAssignable")
                      : t("userForm.roleDescription")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEditMode && (
              <FormField
                control={form.control}
                name="password"
                disabled={currentUserId === userId}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("forms.password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        disabled={currentUserId === userId}
                        autoCapitalize="none"
                        aria-autocomplete="none"
                        autoComplete="off"
                        autoCorrect="off"
                        autoSave="off"
                        placeholder={
                          isEditMode
                            ? t("userForm.passwordPlaceholderEdit")
                            : t("userForm.passwordPlaceholderCreate")
                        }
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      {isEditMode
                        ? t("userForm.passwordDescriptionEdit")
                        : t("userForm.passwordDescriptionCreate")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" asChild>
                <Link to="/app/users">{t("common.cancel")}</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t("common.saving")
                  : isEditMode
                    ? t("userForm.buttons.update")
                    : t("userForm.buttons.create")}
              </Button>
            </div>
          </form>
        </Form>
        <hr className="my-8" />
      </div>

      <If show={isEditMode && isSuperAdmin && user !== null}>
        <UserPasswordResetForm userId={user?.id || ""} />
      </If>
    </div>
  );
}

type PasswordForm = {
  password: string;
  confirmPassword: string;
};

type PasswordFieldAction =
  | {
      type: "SET_PASSWORD" | "SET_CONFIRM_PASSWORD";
      payload: string;
    }
  | {
      type: "RESET";
    };

function reducer(state: PasswordForm, action: PasswordFieldAction) {
  switch (action.type) {
    case "SET_PASSWORD":
      return { ...state, password: action.payload };
    case "SET_CONFIRM_PASSWORD":
      return { ...state, confirmPassword: action.payload };
    case "RESET":
      return { password: "", confirmPassword: "" };
    default:
      return state;
  }
}

function UserPasswordResetForm({ userId }: { userId: string }) {
  const [passwordFields, dispatch] = useImmerReducer(reducer, {
    password: "",
    confirmPassword: "",
  } as PasswordForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = () => {
    if (passwordFields.password !== passwordFields.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!passwordFields.password) {
      toast.error("Password cannot be empty");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to reset the password?",
    );

    if (confirmed) {
      setIsSubmitting(true);
      resetUserPassword({
        data: { password: passwordFields.password, userId },
      })
        .then(() => {
          toast.success("Password reset successfully");
          dispatch({ type: "RESET" });
        })
        .catch((error) => {
          console.error("Failed to reset password:", error);
          toast.error("Failed to reset password");
        })
        .finally(() => {
          setIsSubmitting(false);
        });
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <div className="max-w-xl pt-4 space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl">Change Password</h1>
      </div>

      <Input
        label="New Password"
        type="password"
        placeholder="Enter new password"
        value={passwordFields.password}
        onChange={(e) =>
          dispatch({ type: "SET_PASSWORD", payload: e.target.value })
        }
      />
      <Input
        label="Confirm Password"
        type="password"
        placeholder="Confirm new password"
        value={passwordFields.confirmPassword}
        onChange={(e) =>
          dispatch({ type: "SET_CONFIRM_PASSWORD", payload: e.target.value })
        }
      />

      <div className="flex justify-end gap-4">
        <Button type="button" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Update Password"}
        </Button>
      </div>
    </div>
  );
}
