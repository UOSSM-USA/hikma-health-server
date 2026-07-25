/**
 * The behaviour worth pinning is the seeding guard: offline the vitals list is a
 * live subscription, so a form that re-seeds on every emission would discard
 * what the provider typed — silently, and only on a device that is syncing.
 */

import { Option } from "effect"
import { fireEvent } from "@testing-library/react-native"
import { render } from "../helpers/renderWithProviders"
import PatientVitals from "../../app/models/PatientVitals"

jest.mock("react-native-keyboard-controller", () => {
  const RN = require("react-native")
  return {
    KeyboardAwareScrollView: RN.ScrollView,
    KeyboardProvider: ({ children }: any) => children,
  }
})

jest.mock("react-native-edge-to-edge", () => ({ SystemBars: () => null }))

jest.mock("expo-screen-orientation", () => ({
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  removeOrientationChangeListener: jest.fn(),
  getOrientationAsync: jest.fn(() => Promise.resolve(1)),
  OrientationLock: { DEFAULT: 0 },
  Orientation: { PORTRAIT_UP: 1 },
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb) => cb()),
  useScrollToTop: jest.fn(),
}))

jest.mock("@xstate/react", () => ({
  useSelector: jest.fn(() => "provider-1"),
}))

jest.mock("@/store/provider", () => ({ providerStore: {} }))

jest.mock("react-native-root-toast", () => ({
  show: jest.fn(),
  durations: { SHORT: 2000 },
  positions: { BOTTOM: -40 },
}))

const mockCan = jest.fn(() => true)
jest.mock("@/hooks/usePermissionGuard", () => ({
  usePermissionGuard: jest.fn(() => ({
    permissions: null,
    isLoading: false,
    can: mockCan,
    check: jest.fn(),
    checkOperation: jest.fn(),
    checkEditEvent: jest.fn(),
  })),
}))

const mockVitals = jest.fn<PatientVitals.T[], []>(() => [])
jest.mock("@/hooks/usePatientVitals", () => ({
  usePatientVitals: () => mockVitals(),
}))

const mockCreateMutate = jest.fn(async () => ({ id: "new-vital" }))
const mockUpdateMutate = jest.fn(async () => ({ id: "vital-1" }))
jest.mock("@/hooks/useCreateVitals", () => ({
  useCreateVitals: () => ({ mutateAsync: mockCreateMutate }),
}))
jest.mock("@/hooks/useUpdateVitals", () => ({
  useUpdateVitals: () => ({ mutateAsync: mockUpdateMutate }),
}))

import { VitalFormScreen } from "../../app/screens/VitalFormScreen"

const storedVital: PatientVitals.T = {
  ...PatientVitals.empty,
  id: "vital-1",
  patientId: "patient-1",
  timestamp: new Date("2024-06-15T10:00:00Z"),
  systolicBp: Option.some(120),
  diastolicBp: Option.some(80),
  bpPosition: Option.some("sitting" as const),
  pulseRate: Option.some(72),
  heartRate: Option.some(70),
}

const renderScreen = (params: { patientId: string; vitalId?: string }) => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() }
  const utils = render(
    <VitalFormScreen
      navigation={navigation as never}
      route={{ key: "k", name: "VitalForm", params } as never}
    />,
  )
  return { ...utils, navigation }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCan.mockReturnValue(true)
  mockVitals.mockReturnValue([])
})

describe("VitalFormScreen editing an existing entry", () => {
  it("prefills the form from the stored record", () => {
    mockVitals.mockReturnValue([storedVital])

    const { getByDisplayValue } = renderScreen({ patientId: "patient-1", vitalId: "vital-1" })

    expect(getByDisplayValue("120")).toBeTruthy()
    expect(getByDisplayValue("80")).toBeTruthy()
    expect(getByDisplayValue("72")).toBeTruthy()
  })

  it("keeps what the provider typed when the vitals subscription re-emits", () => {
    mockVitals.mockReturnValue([storedVital])
    const { getByDisplayValue, rerender, navigation } = renderScreen({
      patientId: "patient-1",
      vitalId: "vital-1",
    })

    fireEvent.changeText(getByDisplayValue("120"), "135")

    // A sync hands back a fresh object carrying the old server value.
    mockVitals.mockReturnValue([{ ...storedVital, systolicBp: Option.some(120) }])
    rerender(
      <VitalFormScreen
        navigation={navigation as never}
        route={
          {
            key: "k",
            name: "VitalForm",
            params: { patientId: "patient-1", vitalId: "vital-1" },
          } as never
        }
      />,
    )

    expect(getByDisplayValue("135")).toBeTruthy()
  })

  it("saves through the update path, not by creating a second record", async () => {
    mockVitals.mockReturnValue([storedVital])

    const { getByText } = renderScreen({ patientId: "patient-1", vitalId: "vital-1" })
    fireEvent.press(getByText("Save"))
    await Promise.resolve()

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    expect(mockCreateMutate).not.toHaveBeenCalled()
    expect(mockUpdateMutate.mock.calls[0][0]).toMatchObject({ id: "vital-1" })
  })

  it("never sends heart rate, which the form does not collect", async () => {
    mockVitals.mockReturnValue([storedVital])

    const { getByText } = renderScreen({ patientId: "patient-1", vitalId: "vital-1" })
    fireEvent.press(getByText("Save"))
    await Promise.resolve()

    const { data } = mockUpdateMutate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect("heartRate" in data).toBe(false)
  })

  it("refuses to save before the entry being edited has loaded", async () => {
    mockVitals.mockReturnValue([])

    const { getByText } = renderScreen({ patientId: "patient-1", vitalId: "vital-1" })
    fireEvent.press(getByText("Save"))
    await Promise.resolve()

    expect(mockUpdateMutate).not.toHaveBeenCalled()
    expect(getByText("vitalForm:loadingEntry")).toBeTruthy()
  })

  it("blocks the save when the provider lacks edit permission", async () => {
    mockCan.mockReturnValue(false)
    mockVitals.mockReturnValue([storedVital])

    const { getByText } = renderScreen({ patientId: "patient-1", vitalId: "vital-1" })
    fireEvent.press(getByText("Save"))
    await Promise.resolve()

    expect(mockCan).toHaveBeenCalledWith("vitals:edit")
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })
})

describe("VitalFormScreen recording a new entry", () => {
  it("starts blank and saves through the create path", async () => {
    const { getByText, queryByDisplayValue } = renderScreen({ patientId: "patient-1" })

    expect(queryByDisplayValue("120")).toBeNull()

    fireEvent.press(getByText("Save"))
    await Promise.resolve()

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })

  it("asks for the create permission, not the edit one", () => {
    const { getByText } = renderScreen({ patientId: "patient-1" })
    fireEvent.press(getByText("Save"))

    expect(mockCan).toHaveBeenCalledWith("vitals:create")
  })
})
