/**
 * The blocking manual-sync progress screen.
 *
 * Most of what matters here is not what it renders but what it refuses to do:
 * let the device sleep, let hardware back dismiss a run mid-write, or offer to
 * continue something that cannot be continued.
 */

import { render, fireEvent } from "@testing-library/react-native"
import { BackHandler } from "react-native"

const mockAbort = jest.fn()
const mockStart = jest.fn()
const mockResume = jest.fn()

const RUNNING = {
  phase: "pulling",
  since: 0,
  table: "patients",
  pagesApplied: 2,
  recordsApplied: 600,
  recordsPushed: 4,
  rejectedCount: 0,
  tablesRemaining: 3,
  error: null,
  resumable: false,
}

let mockState: Record<string, unknown> = { ...RUNNING }

jest.mock("@/hooks/useManualSync", () => ({
  useManualSync: () => ({ state: mockState, start: mockStart, resume: mockResume, abort: mockAbort }),
}))

jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }))

// `Screen` subscribes to orientation changes and unsubscribes on unmount; the
// native module returns nothing here, so the teardown call rejects it.
jest.mock("expo-screen-orientation", () => ({
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  removeOrientationChangeListener: jest.fn(),
  getOrientationAsync: jest.fn(async () => 1),
  OrientationLock: { DEFAULT: 0 },
  Orientation: { PORTRAIT_UP: 1 },
}))

// Also reached through `Screen`. It defers a status-bar write to setImmediate,
// which fires after the jest environment is torn down and takes the run with it.
jest.mock("react-native-edge-to-edge", () => ({
  SystemBars: () => null,
}))

// Reached through `Screen`; the native module is not linked under jest.
jest.mock("react-native-keyboard-controller", () => {
  const RN = require("react-native")
  return {
    KeyboardAwareScrollView: RN.ScrollView,
    KeyboardProvider: ({ children }: { children: unknown }) => children,
  }
})

import { useKeepAwake } from "expo-keep-awake"

import { SafeAreaProvider } from "react-native-safe-area-context"

import { ManualSyncScreen } from "@/screens/ManualSyncScreen"
import { ThemeProvider } from "@/theme/context"

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const route = { params: { peerId: "p1", sinceDays: 7 } } as never

/** Navigation listeners the screen registers, so tests can fire them. */
const listeners: Record<string, (() => void)[]> = {}

const navigation = {
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: (event: string, handler: () => void) => {
    ;(listeners[event] ??= []).push(handler)
    return () => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler)
    }
  },
} as never

const fire = (event: string) => (listeners[event] ?? []).forEach((handler) => handler())

// The shared Screen/Text/Button components read the design tokens through
// useAppTheme, which throws outside a provider.
const wrapped = () => (
  <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
    <ThemeProvider initialContext="light">
      <ManualSyncScreen route={route} navigation={navigation} />
    </ThemeProvider>
  </SafeAreaProvider>
)

const screen = () => render(wrapped())

/** The registered hardware-back handler. */
const backHandler = (spy: jest.SpyInstance) => spy.mock.calls[0][1] as () => boolean

let backSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  mockState = { ...RUNNING }
  for (const event of Object.keys(listeners)) delete listeners[event]
  backSpy = jest
    .spyOn(BackHandler, "addEventListener")
    .mockReturnValue({ remove: jest.fn() } as never)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("ManualSyncScreen", () => {
  // A ten-minute foreground operation must not let the device sleep: JS timers
  // throttle and the transfer stalls in a way indistinguishable from a hang.
  it("keeps the screen awake for the duration of the run", () => {
    screen()
    expect(useKeepAwake).toHaveBeenCalled()
  })

  it("starts the run once, for the range it was given", () => {
    const view = screen()
    view.rerender(wrapped())

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockStart).toHaveBeenCalledWith(7)
  })

  // The focus event that follows mount must not start a second run.
  it("does not start again on the focus that follows mount", () => {
    screen()
    fire("focus")
    expect(mockStart).toHaveBeenCalledTimes(1)
  })

  // Drawer screens stay mounted across navigation. Without a per-visit reset,
  // returning here would show the last run's "Sync complete" and start nothing.
  it("starts a fresh run when the user comes back to the screen", () => {
    screen()
    mockState = { ...RUNNING, phase: "done" }

    fire("blur")
    fire("focus")

    expect(mockStart).toHaveBeenCalledTimes(2)
  })

  it("does not start a run merely because the screen lost focus", () => {
    screen()
    fire("blur")
    expect(mockStart).toHaveBeenCalledTimes(1)
  })

  it("offers abort while a run is in progress", () => {
    const { getByText } = screen()
    fireEvent.press(getByText(/abort/i))
    expect(mockAbort).toHaveBeenCalled()
  })

  it("shows what is being transferred", () => {
    const { getByText } = screen()
    expect(getByText(/patients/)).toBeTruthy()
    expect(getByText(/600/)).toBeTruthy()
  })

  it("swallows Android hardware back while running", () => {
    screen()
    expect(backHandler(backSpy)()).toBe(true)
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  it("swallows hardware back during the push phase too", () => {
    mockState = { ...RUNNING, phase: "pushing" }
    screen()
    expect(backHandler(backSpy)()).toBe(true)
  })

  it("allows leaving once the run is done", () => {
    mockState = { ...RUNNING, phase: "done", rejectedCount: 0 }
    screen()
    expect(backHandler(backSpy)()).toBe(false)
  })

  it("allows leaving after a failure", () => {
    mockState = { ...RUNNING, phase: "error", error: "x", resumable: false }
    screen()
    expect(backHandler(backSpy)()).toBe(false)
  })

  it("does not offer abort once the run has finished", () => {
    mockState = { ...RUNNING, phase: "done" }
    const { queryByText } = screen()
    expect(queryByText(/abort/i)).toBeNull()
  })

  it("reports both directions on completion", () => {
    mockState = { ...RUNNING, phase: "done", recordsPushed: 2, recordsApplied: 10 }
    const { getByText } = screen()
    expect(getByText(/2 uploaded, 10 downloaded/)).toBeTruthy()
  })

  // Rejected records are still pending locally. Saying so is the difference
  // between a user retrying and a user assuming their edits are safe.
  it("surfaces a conflict count when the server rejected records", () => {
    mockState = { ...RUNNING, phase: "done", recordsApplied: 10, recordsPushed: 2, rejectedCount: 4 }
    const { getByText } = screen()
    expect(getByText(/4 record/)).toBeTruthy()
  })

  it("says nothing about conflicts when there were none", () => {
    mockState = { ...RUNNING, phase: "done", rejectedCount: 0 }
    const { queryByText } = screen()
    expect(queryByText(/could not be saved/)).toBeNull()
  })

  it("offers to continue after a resumable failure", () => {
    mockState = { ...RUNNING, phase: "error", error: "Network unavailable", resumable: true }
    const { getByText } = screen()
    expect(getByText(/continue/i)).toBeTruthy()
    expect(getByText(/Network unavailable/)).toBeTruthy()
  })

  // Continue must go through `resume`, which reuses the original range. Calling
  // `start` would recompute `since` from the clock and discard the cursor.
  it("continues from the stored cursor rather than restarting", () => {
    mockState = { ...RUNNING, phase: "error", error: "x", resumable: true }
    const { getByText } = screen()

    mockStart.mockClear()
    fireEvent.press(getByText(/continue/i))

    expect(mockResume).toHaveBeenCalled()
    expect(mockStart).not.toHaveBeenCalled()
  })

  it("does not offer to continue after a terminal failure", () => {
    mockState = { ...RUNNING, phase: "error", error: "Server rejected the cursor", resumable: false }
    const { queryByText } = screen()
    expect(queryByText(/continue/i)).toBeNull()
  })

  it("closes only when the run is not in flight", () => {
    mockState = { ...RUNNING, phase: "done" }
    const { getByText } = screen()
    fireEvent.press(getByText(/close/i))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  it("offers no way out while running", () => {
    const { queryByText } = screen()
    expect(queryByText(/close/i)).toBeNull()
  })
})
