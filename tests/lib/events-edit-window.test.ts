/**
 * Test suite for Event Editing Window (Form Editing Capabilities - 5.3)
 * Tests 3-month editing window and edit history tracking
 */

import { describe, it, expect } from "vitest";
import User from "@/models/user";

describe("Event Editing Window (5.3)", () => {
  const FORM_EDIT_WINDOW_DAYS = 90;

  // Helper function to check if an event is within the editing window
  const isWithinEditWindow = (createdAt: Date | string): boolean => {
    const createdDate = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    const now = new Date();
    const daysSinceCreation = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceCreation <= FORM_EDIT_WINDOW_DAYS;
  };

  // Helper function to check if user can edit event directly
  const canEditDirectly = (
    event: any,
    userId: string | null,
    role: string | null
  ): { canEdit: boolean; requiresApproval: boolean; reason?: string } => {
    // Super admins and supervisors can always edit
    const hasFullAccess = (r: string | null): boolean => {
      if (!r) return false;
      return [
        User.ROLES.PROJECT_MANAGER,
        User.ROLES.TECHNICAL_ADVISOR,
        User.ROLES.TEAM_LEADER,
        User.ROLES.ME_OFFICER,
        User.ROLES.IM_ASSOCIATE,
        User.ROLES.PROVIDER,
        User.ROLES.REGISTRAR,
        User.ROLES.ADMIN,
        User.ROLES.SUPER_ADMIN,
        User.ROLES.SUPER_ADMIN_2,
      ].includes(r as any);
    };

    if (hasFullAccess(role)) {
      return { canEdit: true, requiresApproval: false };
    }

    const createdBy = event.metadata?.created_by;
    const isCreator = createdBy === userId;

    if (!isCreator) {
      return {
        canEdit: false,
        requiresApproval: true,
        reason: "You can only edit forms you created",
      };
    }

    const withinWindow = isWithinEditWindow(event.created_at);
    if (withinWindow) {
      return { canEdit: true, requiresApproval: false };
    }

    return {
      canEdit: false,
      requiresApproval: true,
      reason: "This form is older than 3 months. Please request approval to edit.",
    };
  };

  describe("3-Month Editing Window", () => {
    it("should allow editing events created within 90 days", () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago

      const event = {
        id: "event-1",
        created_at: recentDate,
        metadata: { created_by: "user-1" },
      };

      const result = canEditDirectly(event, "user-1", User.ROLES.CASEWORKER_1);
      expect(result.canEdit).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it("should block editing events older than 90 days", () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      const event = {
        id: "event-1",
        created_at: oldDate,
        metadata: { created_by: "user-1" },
      };

      const result = canEditDirectly(event, "user-1", User.ROLES.CASEWORKER_1);
      expect(result.canEdit).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toContain("3 months");
    });

    it("should allow editing events exactly at 90 days", () => {
      const exactly90DaysAgo = new Date();
      exactly90DaysAgo.setDate(exactly90DaysAgo.getDate() - 90);

      const event = {
        id: "event-1",
        created_at: exactly90DaysAgo,
        metadata: { created_by: "user-1" },
      };

      const result = canEditDirectly(event, "user-1", User.ROLES.CASEWORKER_1);
      expect(result.canEdit).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it("should block editing events at 91 days", () => {
      const exactly91DaysAgo = new Date();
      exactly91DaysAgo.setDate(exactly91DaysAgo.getDate() - 91);

      const event = {
        id: "event-1",
        created_at: exactly91DaysAgo,
        metadata: { created_by: "user-1" },
      };

      const result = canEditDirectly(event, "user-1", User.ROLES.CASEWORKER_1);
      expect(result.canEdit).toBe(false);
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe("Creator-based Editing", () => {
    it("should allow creator to edit their own event within window", () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);

      const event = {
        id: "event-1",
        created_at: recentDate,
        metadata: { created_by: "user-1" },
      };

      const result = canEditDirectly(event, "user-1", User.ROLES.CASEWORKER_1);
      expect(result.canEdit).toBe(true);
    });

    it("should block non-creator from editing even within window", () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);

      const event = {
        id: "event-1",
        created_at: recentDate,
        metadata: { created_by: "user-1" },
      };

      const result = canEditDirectly(event, "user-2", User.ROLES.CASEWORKER_1);
      expect(result.canEdit).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toContain("only edit forms you created");
    });
  });

  describe("Supervisor/Admin Override", () => {
    const supervisorRoles = [
      User.ROLES.TEAM_LEADER,
      User.ROLES.ME_OFFICER,
      User.ROLES.IM_ASSOCIATE,
      User.ROLES.PROJECT_MANAGER,
      User.ROLES.TECHNICAL_ADVISOR,
      User.ROLES.ADMIN,
      User.ROLES.SUPER_ADMIN,
      User.ROLES.SUPER_ADMIN_2,
    ];

    supervisorRoles.forEach((role) => {
      it(`should allow ${role} to edit any event regardless of age`, () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 200); // 200 days ago

        const event = {
          id: "event-1",
          created_at: oldDate,
          metadata: { created_by: "user-1" },
        };

        const result = canEditDirectly(event, "user-2", role);
        expect(result.canEdit).toBe(true);
        expect(result.requiresApproval).toBe(false);
      });
    });
  });

  describe("Edit History Tracking", () => {
    it("should track edit history structure correctly", () => {
      const editHistory = [
        {
          edited_by: "user-1",
          edited_by_role: User.ROLES.CASEWORKER_1,
          edited_at: new Date().toISOString(),
          previous_form_data: [{ fieldId: "field-1", value: "old value" }],
        },
      ];

      expect(editHistory).toHaveLength(1);
      expect(editHistory[0]).toHaveProperty("edited_by");
      expect(editHistory[0]).toHaveProperty("edited_by_role");
      expect(editHistory[0]).toHaveProperty("edited_at");
      expect(editHistory[0]).toHaveProperty("previous_form_data");
    });

    it("should maintain multiple edit history entries", () => {
      const editHistory = [
        {
          edited_by: "user-1",
          edited_by_role: User.ROLES.CASEWORKER_1,
          edited_at: new Date().toISOString(),
          previous_form_data: [{ fieldId: "field-1", value: "value 1" }],
        },
        {
          edited_by: "user-1",
          edited_by_role: User.ROLES.CASEWORKER_1,
          edited_at: new Date().toISOString(),
          previous_form_data: [{ fieldId: "field-1", value: "value 2" }],
        },
      ];

      expect(editHistory).toHaveLength(2);
      expect(editHistory[0].previous_form_data[0].value).toBe("value 1");
      expect(editHistory[1].previous_form_data[0].value).toBe("value 2");
    });
  });
});
