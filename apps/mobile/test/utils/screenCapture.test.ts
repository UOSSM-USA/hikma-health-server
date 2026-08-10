jest.mock("react-native-launch-arguments", () => ({
  LaunchArguments: { value: () => ({}) },
}))

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }))

jest.mock("@hikmahealth/js-utils", () => ({
  Logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock("expo-screen-capture", () => ({
  isAvailableAsync: jest.fn(async () => true),
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  enableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
}))

import * as ScreenCapture from "expo-screen-capture"
import * as Sentry from "@sentry/react-native"
import { Logger } from "@hikmahealth/js-utils"

type ScreenCaptureModule = typeof import("../../app/utils/screenCapture")

// The module caches both the availability check and the last applied state, so
// each test needs a fresh instance to exercise them from a known starting point.
function loadModule(): ScreenCaptureModule {
  let module: ScreenCaptureModule | undefined
  jest.isolateModules(() => {
    module = require("../../app/utils/screenCapture")
  })
  return module as ScreenCaptureModule
}

const prevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock
const allow = ScreenCapture.allowScreenCaptureAsync as jest.Mock
const isAvailable = ScreenCapture.isAvailableAsync as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  isAvailable.mockResolvedValue(true)
  prevent.mockResolvedValue(undefined)
  allow.mockResolvedValue(undefined)
})

describe("isCaptureExempt", () => {
  const exemptRoutes = ["Settings", "SyncSettings", "ManualSync", "PrivacyPolicy"]

  it.each(exemptRoutes)("exempts %s", (routeName) => {
    expect(loadModule().isCaptureExempt(routeName)).toBe(true)
  })

  const protectedRoutes = [
    "Login",
    "Welcome",
    "Patients",
    "PatientVisitsList",
    "EventForm",
    "PatientRegistrationForm",
    "VisitPrescriptions",
    "VitalHistory",
  ]

  it.each(protectedRoutes)("protects %s", (routeName) => {
    expect(loadModule().isCaptureExempt(routeName)).toBe(false)
  })

  it("protects an unrecognised route so a renamed screen fails closed", () => {
    expect(loadModule().isCaptureExempt("SomeRouteThatDoesNotExist")).toBe(false)
    expect(loadModule().isCaptureExempt("")).toBe(false)
  })
})

describe("applyScreenCapturePolicy", () => {
  it("protects when the focused route is unknown", async () => {
    await loadModule().applyScreenCapturePolicy(undefined)

    expect(prevent).toHaveBeenCalledTimes(1)
    expect(allow).not.toHaveBeenCalled()
  })

  it("protects a clinical route and permits capture on a settings route", async () => {
    const { applyScreenCapturePolicy } = loadModule()

    await applyScreenCapturePolicy("PatientVisitsList")
    expect(prevent).toHaveBeenCalledTimes(1)

    await applyScreenCapturePolicy("SyncSettings")
    expect(allow).toHaveBeenCalledTimes(1)
  })

  it("holds its own key so releasing does not clear another caller's protection", async () => {
    const { applyScreenCapturePolicy } = loadModule()

    await applyScreenCapturePolicy("Patients")
    await applyScreenCapturePolicy("Settings")

    expect(prevent).toHaveBeenCalledWith("route-policy")
    expect(allow).toHaveBeenCalledWith("route-policy")
  })

  it("does not touch the native bridge when the policy is unchanged", async () => {
    const { applyScreenCapturePolicy } = loadModule()

    await applyScreenCapturePolicy("Patients")
    await applyScreenCapturePolicy("PatientVisitsList")
    await applyScreenCapturePolicy("EventForm")

    expect(prevent).toHaveBeenCalledTimes(1)
    expect(allow).not.toHaveBeenCalled()
  })

  it("retries on the next navigation after a native failure", async () => {
    const { applyScreenCapturePolicy } = loadModule()
    prevent.mockRejectedValueOnce(new Error("no activity"))

    await applyScreenCapturePolicy("Patients")
    expect(prevent).toHaveBeenCalledTimes(1)

    await applyScreenCapturePolicy("PatientVisitsList")
    expect(prevent).toHaveBeenCalledTimes(2)
  })

  it("reports a repeating failure to Sentry once, but logs every occurrence", async () => {
    const { applyScreenCapturePolicy } = loadModule()
    prevent.mockRejectedValue(new Error("missing activity"))

    await applyScreenCapturePolicy("Patients")
    await applyScreenCapturePolicy("PatientVisitsList")
    await applyScreenCapturePolicy("EventForm")

    expect(prevent).toHaveBeenCalledTimes(3)
    expect(Logger.error).toHaveBeenCalledTimes(3)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it("stays silent when the module is unavailable, as on web", async () => {
    isAvailable.mockResolvedValue(false)
    const { applyScreenCapturePolicy } = loadModule()

    await applyScreenCapturePolicy("Patients")
    await applyScreenCapturePolicy("Settings")

    expect(prevent).not.toHaveBeenCalled()
    expect(allow).not.toHaveBeenCalled()
  })

  it("survives an availability check that throws", async () => {
    isAvailable.mockRejectedValue(new Error("unavailable"))
    const { applyScreenCapturePolicy } = loadModule()

    await expect(applyScreenCapturePolicy("Patients")).resolves.toBeUndefined()
    expect(prevent).not.toHaveBeenCalled()
  })
})
