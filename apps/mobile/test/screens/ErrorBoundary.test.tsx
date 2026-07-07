import { View } from "react-native"
import { render } from "@testing-library/react-native"

import { ErrorBoundary } from "@/screens/ErrorScreen/ErrorBoundary"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { FATAL: "Fatal", HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

jest.mock("@/screens/ErrorScreen/ErrorDetails", () => ({
  ErrorDetails: () => null,
}))

const reportCrashMock = reportCrash as jest.Mock

const Boom = (): never => {
  throw new Error("render exploded")
}

describe("ErrorBoundary", () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    reportCrashMock.mockClear()
    // React logs caught render errors to console.error regardless of the boundary
    errorSpy = jest.spyOn(console, "error").mockImplementation()
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("reports a caught render error with its component stack", () => {
    render(
      <ErrorBoundary catchErrors="always">
        <Boom />
      </ErrorBoundary>,
    )

    expect(reportCrashMock).toHaveBeenCalledTimes(1)
    const [error, type, componentStack] = reportCrashMock.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("render exploded")
    expect(type).toBe(ErrorType.FATAL)
    expect(componentStack).toContain("Boom")
  })

  // React still stops the error here even with the error screen turned off, so if this
  // boundary doesn't report it, nothing will
  it("reports even when catchErrors is never", () => {
    render(
      <ErrorBoundary catchErrors="never">
        <Boom />
      </ErrorBoundary>,
    )

    expect(reportCrashMock).toHaveBeenCalledTimes(1)
    expect(reportCrashMock.mock.calls[0][0].message).toBe("render exploded")
  })

  it("does not report when no error occurs", () => {
    render(
      <ErrorBoundary catchErrors="always">
        <View />
      </ErrorBoundary>,
    )

    expect(reportCrashMock).not.toHaveBeenCalled()
  })
})
