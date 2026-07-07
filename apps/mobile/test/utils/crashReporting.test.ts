import * as Sentry from "@sentry/react-native"

import { reportCrash, ErrorType } from "../../app/utils/crashReporting"

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
}))

const captureException = Sentry.captureException as jest.Mock

describe("crashReporting", () => {
  describe("ErrorType enum", () => {
    it("has FATAL and HANDLED values", () => {
      expect(ErrorType.FATAL).toBe("Fatal")
      expect(ErrorType.HANDLED).toBe("Handled")
    })

    it("only contains two members", () => {
      const members = Object.values(ErrorType).filter((v) => typeof v === "string")
      expect(members).toHaveLength(2)
    })
  })

  describe("reportCrash", () => {
    let consoleSpy: jest.SpyInstance
    let errorSpy: jest.SpyInstance

    beforeEach(() => {
      captureException.mockClear()
      consoleSpy = jest.spyOn(console, "log").mockImplementation()
      errorSpy = jest.spyOn(console, "error").mockImplementation()
    })

    afterEach(() => {
      consoleSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it("logs the error in dev mode", () => {
      const error = new Error("test error")
      reportCrash(error)
      expect(errorSpy).toHaveBeenCalledWith(error)
      expect(consoleSpy).toHaveBeenCalledWith({
        message: "test error",
        type: ErrorType.FATAL,
      })
    })

    it("defaults to FATAL error type", () => {
      const error = new Error("fatal test")
      reportCrash(error)
      expect(consoleSpy).toHaveBeenCalledWith({
        message: "fatal test",
        type: ErrorType.FATAL,
      })
    })

    it("respects custom error type", () => {
      const error = new Error("handled test")
      reportCrash(error, ErrorType.HANDLED)
      expect(consoleSpy).toHaveBeenCalledWith({
        message: "handled test",
        type: ErrorType.HANDLED,
      })
    })

    it("handles error with no message", () => {
      const error = new Error()
      reportCrash(error)
      // An empty message is falsy, so it falls back to "Unknown"
      expect(consoleSpy).toHaveBeenCalledWith({
        message: "Unknown",
        type: ErrorType.FATAL,
      })
    })

    it("does not throw even with unusual Error subclasses", () => {
      class CustomError extends Error {
        code = 42
      }
      expect(() => reportCrash(new CustomError("custom"))).not.toThrow()
    })

    it("sends the error to Sentry at fatal level", () => {
      const error = new Error("boom")
      reportCrash(error)
      expect(captureException).toHaveBeenCalledWith(error, {
        level: "fatal",
        tags: { errorType: ErrorType.FATAL },
        contexts: undefined,
      })
    })

    it("downgrades handled errors to error level", () => {
      reportCrash(new Error("handled"), ErrorType.HANDLED)
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ level: "error", tags: { errorType: ErrorType.HANDLED } }),
      )
    })

    it("attaches the component stack as React context when given one", () => {
      reportCrash(new Error("render"), ErrorType.FATAL, "\n    in Broken\n    in App")
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          contexts: { react: { componentStack: "\n    in Broken\n    in App" } },
        }),
      )
    })

    it("omits React context when the component stack is null", () => {
      reportCrash(new Error("no stack"), ErrorType.FATAL, null)
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ contexts: undefined }),
      )
    })
  })
})
