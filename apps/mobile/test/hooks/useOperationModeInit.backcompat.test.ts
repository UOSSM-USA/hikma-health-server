/**
 * Migration of the stored operation-mode preference.
 *
 * Covers the deprecated "sync_hub" value from earlier app versions, and the
 * stale "online" a device carries if the user opted into online mode before it
 * was disabled — left alone, that preference reactivates online mode silently
 * the moment the gate is lifted.
 *
 * Imports the real function rather than restating it. An earlier version of
 * this file kept its own copy, which could drift from the hook without any
 * test noticing.
 */

import fc from "fast-check"
import { resolvePreference } from "../../app/hooks/useOperationModeInit"
import type { OperationMode } from "../../app/store/operationMode"

// ── Tests ────────────────────────────────────────────────────────────

describe("useOperationModeInit — backward compatibility", () => {
  describe("resolvePreference (pure logic)", () => {
    it('maps "online" → offline and clears the stale preference', () => {
      const result = resolvePreference("online")
      expect(result.mode).toBe("offline")
      expect(result.shouldClean).toBe(true)
    })

    it('maps "offline" → offline, no cleanup', () => {
      const result = resolvePreference("offline")
      expect(result.mode).toBe("offline")
      expect(result.shouldClean).toBe(false)
    })

    it('maps null (first launch) → offline, no cleanup', () => {
      const result = resolvePreference(null)
      expect(result.mode).toBe("offline")
      expect(result.shouldClean).toBe(false)
    })

    it('maps deprecated "sync_hub" → offline with cleanup flag', () => {
      const result = resolvePreference("sync_hub")
      expect(result.mode).toBe("offline")
      expect(result.shouldClean).toBe(true)
    })

    it("nothing produces online mode while the gate is on (property)", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.string({ minLength: 0, maxLength: 30 }),
          ),
          (stored) => {
            expect(resolvePreference(stored).mode).toBe("offline")
          },
        ),
      )
    })

    it("result mode is always a valid OperationMode", () => {
      const validModes: readonly OperationMode[] = ["offline", "online"]
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.string({ minLength: 0, maxLength: 50 }),
          ),
          (stored) => {
            const { mode } = resolvePreference(stored)
            expect(validModes).toContain(mode)
          },
        ),
      )
    })

    it("shouldClean is true for exactly 'sync_hub' and 'online' (property)", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.string({ minLength: 0, maxLength: 30 }),
          ),
          (stored) => {
            const { shouldClean } = resolvePreference(stored)
            expect(shouldClean).toBe(stored === "sync_hub" || stored === "online")
          },
        ),
      )
    })

    it("never returns sync_hub as mode regardless of input", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant("sync_hub"),
            fc.constant("online"),
            fc.constant("offline"),
            fc.string({ minLength: 0, maxLength: 50 }),
          ),
          (stored) => {
            const { mode } = resolvePreference(stored)
            expect(mode).not.toBe("sync_hub")
          },
        ),
      )
    })

    it("is deterministic", () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.string()),
          (stored) => {
            const a = resolvePreference(stored)
            const b = resolvePreference(stored)
            expect(a).toEqual(b)
          },
        ),
      )
    })
  })
})
