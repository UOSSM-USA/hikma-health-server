import { describe, it, expect } from "vitest";
import User from "../../src/models/user";

describe("User Permission Hierarchy System", () => {
  describe("ROLE_HIERARCHY", () => {
    it("should have correct hierarchy levels", () => {
      expect(User.ROLE_HIERARCHY.registrar).toBe(1);
      expect(User.ROLE_HIERARCHY.provider).toBe(2);
      expect(User.ROLE_HIERARCHY.admin).toBe(3);
      expect(User.ROLE_HIERARCHY.super_admin).toBe(4);
    });

    it("should have increasing levels for higher roles", () => {
      expect(User.ROLE_HIERARCHY.registrar).toBeLessThan(User.ROLE_HIERARCHY.provider);
      expect(User.ROLE_HIERARCHY.provider).toBeLessThan(User.ROLE_HIERARCHY.admin);
      expect(User.ROLE_HIERARCHY.admin).toBeLessThan(User.ROLE_HIERARCHY.super_admin);
    });
  });

  describe("canManageRole", () => {
    it("should allow super_admin to manage all roles", () => {
      expect(User.canManageRole("super_admin", "registrar")).toBe(true);
      expect(User.canManageRole("super_admin", "provider")).toBe(true);
      expect(User.canManageRole("super_admin", "admin")).toBe(true);
      expect(User.canManageRole("super_admin", "super_admin")).toBe(true);
    });

    it("should allow admin to manage registrar and provider", () => {
      expect(User.canManageRole("admin", "registrar")).toBe(true);
      expect(User.canManageRole("admin", "provider")).toBe(true);
      expect(User.canManageRole("admin", "admin")).toBe(true);
    });

    it("should NOT allow admin to manage super_admin", () => {
      expect(User.canManageRole("admin", "super_admin")).toBe(false);
    });

    it("should NOT allow provider to manage any users", () => {
      expect(User.canManageRole("provider", "registrar")).toBe(false);
      expect(User.canManageRole("provider", "provider")).toBe(false);
      expect(User.canManageRole("provider", "admin")).toBe(false);
      expect(User.canManageRole("provider", "super_admin")).toBe(false);
    });

    it("should NOT allow registrar to manage any users", () => {
      expect(User.canManageRole("registrar", "registrar")).toBe(false);
      expect(User.canManageRole("registrar", "provider")).toBe(false);
      expect(User.canManageRole("registrar", "admin")).toBe(false);
      expect(User.canManageRole("registrar", "super_admin")).toBe(false);
    });
  });

  describe("canDeleteRole", () => {
    it("should only allow super_admin to delete users", () => {
      expect(User.canDeleteRole("super_admin", "registrar")).toBe(true);
      expect(User.canDeleteRole("super_admin", "provider")).toBe(true);
      expect(User.canDeleteRole("super_admin", "admin")).toBe(true);
      expect(User.canDeleteRole("super_admin", "super_admin")).toBe(true);
    });

    it("should NOT allow admin to delete users", () => {
      expect(User.canDeleteRole("admin", "registrar")).toBe(false);
      expect(User.canDeleteRole("admin", "provider")).toBe(false);
      expect(User.canDeleteRole("admin", "admin")).toBe(false);
      expect(User.canDeleteRole("admin", "super_admin")).toBe(false);
    });

    it("should NOT allow provider to delete users", () => {
      expect(User.canDeleteRole("provider", "registrar")).toBe(false);
      expect(User.canDeleteRole("provider", "provider")).toBe(false);
      expect(User.canDeleteRole("provider", "admin")).toBe(false);
      expect(User.canDeleteRole("provider", "super_admin")).toBe(false);
    });

    it("should NOT allow registrar to delete users", () => {
      expect(User.canDeleteRole("registrar", "registrar")).toBe(false);
      expect(User.canDeleteRole("registrar", "provider")).toBe(false);
      expect(User.canDeleteRole("registrar", "admin")).toBe(false);
      expect(User.canDeleteRole("registrar", "super_admin")).toBe(false);
    });
  });

  describe("canCreateRole", () => {
    it("should allow super_admin to create all roles", () => {
      expect(User.canCreateRole("super_admin", "registrar")).toBe(true);
      expect(User.canCreateRole("super_admin", "provider")).toBe(true);
      expect(User.canCreateRole("super_admin", "admin")).toBe(true);
      expect(User.canCreateRole("super_admin", "super_admin")).toBe(true);
    });

    it("should allow admin to create roles except super_admin", () => {
      expect(User.canCreateRole("admin", "registrar")).toBe(true);
      expect(User.canCreateRole("admin", "provider")).toBe(true);
      expect(User.canCreateRole("admin", "admin")).toBe(true);
    });

    it("should NOT allow admin to create super_admin", () => {
      expect(User.canCreateRole("admin", "super_admin")).toBe(false);
    });

    it("should NOT allow provider to create any users", () => {
      expect(User.canCreateRole("provider", "registrar")).toBe(false);
      expect(User.canCreateRole("provider", "provider")).toBe(false);
      expect(User.canCreateRole("provider", "admin")).toBe(false);
      expect(User.canCreateRole("provider", "super_admin")).toBe(false);
    });

    it("should NOT allow registrar to create any users", () => {
      expect(User.canCreateRole("registrar", "registrar")).toBe(false);
      expect(User.canCreateRole("registrar", "provider")).toBe(false);
      expect(User.canCreateRole("registrar", "admin")).toBe(false);
      expect(User.canCreateRole("registrar", "super_admin")).toBe(false);
    });
  });

  describe("canUpdateUser", () => {
    it("should allow super_admin to update all users", () => {
      expect(User.canUpdateUser("super_admin", "registrar")).toBe(true);
      expect(User.canUpdateUser("super_admin", "provider")).toBe(true);
      expect(User.canUpdateUser("super_admin", "admin")).toBe(true);
      expect(User.canUpdateUser("super_admin", "super_admin")).toBe(true);
    });

    it("should allow admin to update lower-level users", () => {
      expect(User.canUpdateUser("admin", "registrar")).toBe(true);
      expect(User.canUpdateUser("admin", "provider")).toBe(true);
      expect(User.canUpdateUser("admin", "admin")).toBe(true);
    });

    it("should NOT allow admin to update super_admin", () => {
      expect(User.canUpdateUser("admin", "super_admin")).toBe(false);
    });

    it("should prevent role escalation when updating", () => {
      // Admin trying to promote a registrar to super_admin
      expect(User.canUpdateUser("admin", "registrar", "super_admin")).toBe(false);
      
      // Provider trying to promote a registrar to admin
      expect(User.canUpdateUser("provider", "registrar", "admin")).toBe(false);
    });

    it("should allow same-role updates if actor has permission", () => {
      // Super admin updating a registrar to provider
      expect(User.canUpdateUser("super_admin", "registrar", "provider")).toBe(true);
      
      // Admin updating a registrar to provider
      expect(User.canUpdateUser("admin", "registrar", "provider")).toBe(true);
    });

    it("should NOT allow updates without proper permissions", () => {
      // Provider cannot update anyone (including same level)
      expect(User.canUpdateUser("provider", "registrar")).toBe(false);
      expect(User.canUpdateUser("provider", "provider")).toBe(false);
      expect(User.canUpdateUser("provider", "admin")).toBe(false);
      
      // Registrar cannot update anyone (including same level)
      expect(User.canUpdateUser("registrar", "registrar")).toBe(false);
      expect(User.canUpdateUser("registrar", "provider")).toBe(false);
    });
  });

  describe("Security Scenarios", () => {
    describe("Prevent privilege escalation attacks", () => {
      it("should prevent registrar from becoming admin", () => {
        // A registrar trying to edit themselves to become admin
        expect(User.canUpdateUser("registrar", "registrar", "admin")).toBe(false);
      });

      it("should prevent provider from creating admin accounts", () => {
        expect(User.canCreateRole("provider", "admin")).toBe(false);
      });

      it("should prevent admin from creating super_admin accounts", () => {
        expect(User.canCreateRole("admin", "super_admin")).toBe(false);
      });

      it("should prevent admin from deleting super_admin", () => {
        expect(User.canDeleteRole("admin", "super_admin")).toBe(false);
      });
    });

    describe("Valid permission flows", () => {
      it("should allow super_admin to manage entire system", () => {
        // Super admin can create any role
        expect(User.canCreateRole("super_admin", "super_admin")).toBe(true);
        
        // Super admin can update any role
        expect(User.canUpdateUser("super_admin", "super_admin")).toBe(true);
        
        // Super admin can delete any role
        expect(User.canDeleteRole("super_admin", "admin")).toBe(true);
      });

      it("should allow admin to manage clinic users properly", () => {
        // Admin can create registrars and providers
        expect(User.canCreateRole("admin", "registrar")).toBe(true);
        expect(User.canCreateRole("admin", "provider")).toBe(true);
        
        // Admin can update registrars and providers
        expect(User.canUpdateUser("admin", "registrar")).toBe(true);
        expect(User.canUpdateUser("admin", "provider")).toBe(true);
        
        // But admin cannot delete anyone
        expect(User.canDeleteRole("admin", "registrar")).toBe(false);
      });
    });

    describe("Edge cases", () => {
      it("should handle same-role interactions correctly", () => {
        // Providers CANNOT manage other providers
        expect(User.canManageRole("provider", "provider")).toBe(false);
        
        // Registrars CANNOT manage other registrars
        expect(User.canManageRole("registrar", "registrar")).toBe(false);
        
        // Admin can manage other admins
        expect(User.canManageRole("admin", "admin")).toBe(true);
        
        // Super admin can manage other super admins
        expect(User.canManageRole("super_admin", "super_admin")).toBe(true);
      });

      it("should handle role updates to same role", () => {
        // Only admins and super_admins can update users
        expect(User.canUpdateUser("admin", "registrar", "registrar")).toBe(true);
        expect(User.canUpdateUser("super_admin", "admin", "admin")).toBe(true);
        
        // Providers and registrars cannot update anyone
        expect(User.canUpdateUser("provider", "provider", "provider")).toBe(false);
        expect(User.canUpdateUser("registrar", "registrar", "registrar")).toBe(false);
      });
    });
  });

  describe("Role Hierarchy Consistency", () => {
    it("should enforce that only admins and super_admins can manage users", () => {
      // Admins can manage registrars, providers, and other admins
      expect(User.canManageRole("admin", "registrar")).toBe(true);
      expect(User.canManageRole("admin", "provider")).toBe(true);
      expect(User.canManageRole("admin", "admin")).toBe(true);
      expect(User.canManageRole("admin", "super_admin")).toBe(false);
      
      // Super admins can manage everyone
      expect(User.canManageRole("super_admin", "registrar")).toBe(true);
      expect(User.canManageRole("super_admin", "provider")).toBe(true);
      expect(User.canManageRole("super_admin", "admin")).toBe(true);
      expect(User.canManageRole("super_admin", "super_admin")).toBe(true);
      
      // Providers and registrars cannot manage anyone
      expect(User.canManageRole("provider", "registrar")).toBe(false);
      expect(User.canManageRole("registrar", "registrar")).toBe(false);
    });

    it("should enforce consistent permission model across all roles", () => {
      const roles = ["registrar", "provider", "admin", "super_admin"] as const;
      
      for (const actorRole of roles) {
        for (const targetRole of roles) {
          const canManage = User.canManageRole(actorRole, targetRole);
          const canCreate = User.canCreateRole(actorRole, targetRole);
          const canDelete = User.canDeleteRole(actorRole, targetRole);
          const canUpdate = User.canUpdateUser(actorRole, targetRole);
          
          // If you can't manage, you definitely can't update
          if (!canManage) {
            expect(canUpdate).toBe(false);
          }
          
          // Only admins and super_admins should be able to manage/update
          if (actorRole !== "admin" && actorRole !== "super_admin") {
            expect(canManage).toBe(false);
            expect(canUpdate).toBe(false);
            expect(canCreate).toBe(false);
          }
          
          // Only super_admins can delete
          if (actorRole !== "super_admin") {
            expect(canDelete).toBe(false);
          }
        }
      }
    });
  });
});

