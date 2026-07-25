/**
 * The entry point into editing: the edit affordance must exist only for providers
 * allowed to use it, and must carry the pressed entry's id into the form.
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

jest.mock("lucide-react-native", () => ({
  PlusIcon: () => "PlusIcon",
  PencilIcon: () => "PencilIcon",
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

import { VitalHistoryScreen } from "../../app/screens/VitalHistoryScreen"

// i18n is not initialised under test, so translate() yields the raw key.
const EDIT_LABEL = "vitalHistory:editEntry"

const makeVital = (id: string, overrides: Partial<PatientVitals.T> = {}): PatientVitals.T => ({
  ...PatientVitals.empty,
  id,
  patientId: "patient-1",
  timestamp: new Date("2024-06-15T10:00:00Z"),
  systolicBp: Option.some(120),
  diastolicBp: Option.some(80),
  bpPosition: Option.some("sitting" as const),
  ...overrides,
})

const renderScreen = () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() }
  const utils = render(
    <VitalHistoryScreen
      navigation={navigation as never}
      route={{ key: "k", name: "VitalHistory", params: { patientId: "patient-1" } } as never}
    />,
  )
  return { ...utils, navigation }
}

beforeEach(() => {
  mockCan.mockReturnValue(true)
  mockVitals.mockReturnValue([])
})

describe("VitalHistoryScreen", () => {
  it("shows an edit control for each recorded entry", () => {
    mockVitals.mockReturnValue([makeVital("vital-1"), makeVital("vital-2")])

    const { getAllByLabelText } = renderScreen()

    expect(getAllByLabelText(EDIT_LABEL)).toHaveLength(2)
  })

  it("hides the edit control from providers without edit permission", () => {
    mockCan.mockReturnValue(false)
    mockVitals.mockReturnValue([makeVital("vital-1")])

    const { queryAllByLabelText } = renderScreen()

    expect(queryAllByLabelText(EDIT_LABEL)).toHaveLength(0)
  })

  it("gates the edit control on the vitals edit permission specifically", () => {
    mockVitals.mockReturnValue([makeVital("vital-1")])

    renderScreen()

    expect(mockCan).toHaveBeenCalledWith("vitals:edit")
  })

  it("opens the form on the entry that was pressed", () => {
    mockVitals.mockReturnValue([makeVital("vital-1"), makeVital("vital-2")])

    const { getAllByLabelText, navigation } = renderScreen()
    fireEvent.press(getAllByLabelText(EDIT_LABEL)[1])

    expect(navigation.navigate).toHaveBeenCalledWith("VitalForm", {
      patientId: "patient-1",
      vitalId: "vital-2",
    })
  })

  it("opens a blank form from the new-entry action, with no record to edit", () => {
    mockVitals.mockReturnValue([makeVital("vital-1")])

    const { getByText, navigation } = renderScreen()
    fireEvent.press(getByText("vitalHistory:newEntry"))

    expect(navigation.navigate).toHaveBeenCalledWith("VitalForm", { patientId: "patient-1" })
  })

  it("renders the empty state without an edit control when nothing is recorded", () => {
    const { queryAllByLabelText, getByText } = renderScreen()

    expect(getByText("vitalHistory:noRecordedVitals")).toBeTruthy()
    expect(queryAllByLabelText(EDIT_LABEL)).toHaveLength(0)
  })
})
