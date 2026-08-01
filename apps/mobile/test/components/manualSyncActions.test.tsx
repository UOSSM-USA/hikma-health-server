/**
 * The "Sync from…" range picker.
 *
 * What matters: nothing reaches the run without a confirmation, "Everything"
 * gets a materially different one because its cost is unbounded, and an
 * unreadable custom day count is refused rather than widened into "everything"
 * — which is exactly what the date input this replaces used to do.
 */

import { Alert } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"

const mockNavigate = jest.fn()

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

jest.mock("react-native-keyboard-controller", () => {
  const RN = require("react-native")
  return {
    KeyboardAwareScrollView: RN.ScrollView,
    KeyboardProvider: ({ children }: { children: unknown }) => children,
  }
})

import { SafeAreaProvider } from "react-native-safe-area-context"

import { ManualSyncActions } from "@/components/ManualSyncActions"
import { ThemeProvider } from "@/theme/context"

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const renderPicker = () =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider initialContext="light">
        <ManualSyncActions serverId="peer-1" />
      </ThemeProvider>
    </SafeAreaProvider>,
  )

/** The most recent Alert.alert call, as (title, message, buttons). */
const lastAlert = () => {
  const spy = Alert.alert as unknown as jest.Mock
  return spy.mock.calls[spy.mock.calls.length - 1] as [
    string,
    string,
    { text: string; onPress?: () => void }[],
  ]
}

/** Press the confirming button of the most recent alert. */
const confirmAlert = () => {
  const buttons = lastAlert()[2]
  const confirm = buttons.find((b) => b.text !== "Cancel")
  confirm?.onPress?.()
}

const expand = (view: ReturnType<typeof renderPicker>) => {
  fireEvent.press(view.getByText("Sync from…"))
  return view
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("ManualSyncActions", () => {
  it("hides the ranges until asked", () => {
    const { queryByText } = renderPicker()
    expect(queryByText("Last 7 days")).toBeNull()
  })

  it("offers every preset once expanded", () => {
    const { getByText } = expand(renderPicker())
    for (const label of [
      "Last 24 hours",
      "Last 3 days",
      "Last 7 days",
      "Last 14 days",
      "Last 30 days",
      "Last 3 months",
      "Everything",
    ]) {
      expect(getByText(label)).toBeTruthy()
    }
  })

  it("confirms before starting anything", () => {
    const { getByText } = expand(renderPicker())
    fireEvent.press(getByText("Last 7 days"))

    expect(Alert.alert).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("hands the chosen range to the run", () => {
    const { getByText } = expand(renderPicker())
    fireEvent.press(getByText("Last 14 days"))
    confirmAlert()

    expect(mockNavigate).toHaveBeenCalledWith("ManualSync", { peerId: "peer-1", sinceDays: 14 })
  })

  it("passes null for everything, meaning no lower bound", () => {
    const { getByText } = expand(renderPicker())
    fireEvent.press(getByText("Everything"))
    confirmAlert()

    expect(mockNavigate).toHaveBeenCalledWith("ManualSync", { peerId: "peer-1", sinceDays: null })
  })

  // "Everything" is the only range whose cost is unbounded, and the only one a
  // user can pick without realising what they have asked for.
  it("warns about scale for everything, and not for a bounded range", () => {
    const { getByText } = expand(renderPicker())

    fireEvent.press(getByText("Everything"))
    expect(lastAlert()[1]).toMatch(/every record|long time|significant data/i)

    fireEvent.press(getByText("Last 24 hours"))
    expect(lastAlert()[1]).not.toMatch(/every record/i)
  })

  it("accepts a custom day count", () => {
    const view = expand(renderPicker())
    fireEvent.changeText(view.getByPlaceholderText("e.g. 45"), "45")
    fireEvent.press(view.getByText("Sync that many days"))
    confirmAlert()

    expect(mockNavigate).toHaveBeenCalledWith("ManualSync", { peerId: "peer-1", sinceDays: 45 })
  })

  // The date input this replaces treated anything unparseable as "the beginning
  // of time" and told the user it had understood them.
  it("refuses an unreadable day count instead of syncing everything", () => {
    const view = expand(renderPicker())
    fireEvent.changeText(view.getByPlaceholderText("e.g. 45"), "not a number")
    fireEvent.press(view.getByText("Sync that many days"))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(lastAlert()[0]).toMatch(/invalid/i)
  })

  it("refuses an empty day count", () => {
    const view = expand(renderPicker())
    fireEvent.press(view.getByText("Sync that many days"))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(lastAlert()[0]).toMatch(/invalid/i)
  })

  it("refuses zero and negative day counts", () => {
    const view = expand(renderPicker())
    for (const bad of ["0", "-5"]) {
      fireEvent.changeText(view.getByPlaceholderText("e.g. 45"), bad)
      fireEvent.press(view.getByText("Sync that many days"))
    }
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("cancelling starts nothing", () => {
    const { getByText } = expand(renderPicker())
    fireEvent.press(getByText("Last 7 days"))

    const cancel = lastAlert()[2].find((b) => b.text === "Cancel")
    cancel?.onPress?.()

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
