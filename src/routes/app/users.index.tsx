import { createFileRoute, useRouter } from "@tanstack/react-router";
import User from "@/models/user";
import { createServerFn } from "@tanstack/react-start";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
// import { getCookieToken } from "@/lib/auth/request";
// import Token from "@/models/token";
// import { Option } from "effect";
import If from "@/components/if";
import { getCurrentUserId } from "@/lib/server-functions/auth";
import { toast } from "sonner";
import {
  currentUserHasRole,
  getAllUsers,
  getClinicIdsWithUserPermission,
} from "@/lib/server-functions/users";
import UserClinicPermissions from "@/models/user-clinic-permissions";
import { permissionsMiddleware } from "@/middleware/auth";

// const getCurrentUserId = createServerFn({ method: "GET" }).handler(async () => {
//   const tokenCookie = getCookieToken();
//   if (!tokenCookie) return null;

//   const userOption = await Token.getUser(tokenCookie);
//   return Option.match(userOption, {
//     onNone: () => null,
//     onSome: (user) => user.id,
//   });
// });

// const getAllUsers = createServerFn({ method: "GET" }).handler(async () => {
// const users = await User.API.getAll();
// return users;
// });

const deleteUser = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([permissionsMiddleware])
  .handler(async ({ data, context }) => {
    // Check if the current user has permission to delete users
    if (context.role !== User.ROLES.SUPER_ADMIN) {
      return Promise.reject({
        message: "Unauthorized: Only Super Admins can delete users",
        source: "deleteUser",
      });
    }

    // Prevent users from deleting themselves
    if (context.userId === data.id) {
      return Promise.reject({
        message: "Cannot delete your own account",
        source: "deleteUser",
      });
    }

    // Get the target user to check their role
    const targetUser = await User.API.getById(data.id);
    if (!targetUser) {
      return Promise.reject({
        message: "User not found",
        source: "deleteUser",
      });
    }

    // Check role hierarchy - verify actor can delete target role
    if (!context.role || !User.canDeleteRole(context.role, targetUser.role)) {
      return Promise.reject({
        message: `Unauthorized: Cannot delete ${targetUser.role} users`,
        source: "deleteUser",
      });
    }

    return User.API.softDelete(data.id);
  });

const getCurrentUserRole = createServerFn({ method: "GET" })
  .middleware([permissionsMiddleware])
  .handler(async ({ context }) => {
    return context.role;
  });

export const Route = createFileRoute("/app/users/")({
  component: RouteComponent,

  loader: async () => {
    const currentUserId = await getCurrentUserId();
    return {
      users: await getAllUsers(),
      currentUserId,
      currentUserRole: await getCurrentUserRole(),
      currentUserAdminClinics: await getClinicIdsWithUserPermission({
        data: {
          userId: currentUserId || "",
          permission: "is_clinic_admin",
        },
      }),
      isSuperAdmin: await currentUserHasRole({ data: { role: "super_admin" } }),
    };
  },
});

function RouteComponent() {
  const { users, currentUserId, currentUserRole, isSuperAdmin, currentUserAdminClinics } =
    Route.useLoaderData();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, targetUserRole: User.RoleT) => {
    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
    }

    if (!isSuperAdmin) {
      toast.error("Only Super Admins can delete users.");
      return;
    }

    // Additional check for role hierarchy
    if (currentUserRole && !User.canDeleteRole(currentUserRole, targetUserRole)) {
      toast.error(`You cannot delete ${targetUserRole} users.`);
      return;
    }

    setIsDeleting(id);
    try {
      await deleteUser({ data: { id } });
      toast.success("User deleted successfully");
      router.invalidate({ sync: true });
    } catch (error: any) {
      console.error("Failed to delete user:", error);
      toast.error(error?.message || "Failed to delete user");
    } finally {
      setIsDeleting(null);
    }
  };

  const isUserClinicAdmin = (userId: string, clinicId: string) => {
    if (isSuperAdmin) return true;
    if (userId === currentUserId && currentUserAdminClinics.includes(clinicId))
      return true;
    return false;
  };

  /**
   * Check if the current user can edit a target user based on role hierarchy
   */
  const canEditUser = (targetUserRole: User.RoleT): boolean => {
    if (!currentUserRole) return false;
    return User.canManageRole(currentUserRole, targetUserRole);
  };

  /**
   * Check if the current user can delete a target user based on role hierarchy
   */
  const canDeleteUser = (targetUserId: string, targetUserRole: User.RoleT): boolean => {
    // Cannot delete yourself
    if (currentUserId === targetUserId) return false;
    
    if (!currentUserRole) return false;
    return User.canDeleteRole(currentUserRole, targetUserRole);
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button asChild>
          <Link to="/app/users/edit/$" params={{ _splat: "new" }}>
            Add New User
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {/* Show Edit button if user can manage this role and has clinic admin access */}
                  <If
                    show={
                      canEditUser(user.role) &&
                      (isSuperAdmin ||
                        isUserClinicAdmin(
                          currentUserId || "",
                          user.clinic_id || "",
                        ))
                    }
                  >
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/app/users/edit/$" params={{ _splat: user.id }}>
                        Edit
                      </Link>
                    </Button>
                  </If>
                  {/* Show Permissions button only to super admins for non-self users */}
                  <If show={isSuperAdmin && currentUserId !== user.id}>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to="/app/users/manage-permissions/$"
                        params={{ _splat: user.id }}
                      >
                        Permissions
                      </Link>
                    </Button>
                  </If>
                  {/* Show Delete button based on role hierarchy */}
                  <If show={canDeleteUser(user.id, user.role)}>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(user.id, user.role)}
                      disabled={isDeleting === user.id}
                    >
                      {isDeleting === user.id ? "Deleting..." : "Delete"}
                    </Button>
                  </If>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
