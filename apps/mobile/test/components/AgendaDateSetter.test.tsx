import { fireEvent } from "@testing-library/react-native"
import { es } from "date-fns/locale"

import { AgendaDateSetter } from "../../app/components/AgendaDateSetter"
import { getDateFnsLocale } from "../../app/utils/formatDate"
import { render } from "../helpers/renderWithProviders"

jest.mock("react-native-date-picker", () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock("../../app/utils/formatDate", () => ({
  getDateFnsLocale: jest.fn(() => undefined),
}))

// A fixed Wednesday. Under the default (undefined -> en-US, Sunday-start)
// locale its visible week is Jul 12 (Sun) – Jul 18 (Sat).
const wednesday = new Date(2026, 6, 15)
const dayId = (year: number, monthOneBased: number, day: number) =>
  `agenda-day-${year}-${String(monthOneBased).padStart(2, "0")}-${String(day).padStart(2, "0")}`

describe("AgendaDateSetter", () => {
  beforeEach(() => {
    ;(getDateFnsLocale as jest.Mock).mockReturnValue(undefined)
  })

  it("tapping a day selects it without moving the visible week", () => {
    const setDate = jest.fn()
    const { getByTestId } = render(<AgendaDateSetter date={wednesday} setDate={setDate} />)

    fireEvent.press(getByTestId(dayId(2026, 7, 13)))

    expect(setDate).toHaveBeenCalledTimes(1)
    const picked = setDate.mock.calls[0][0] as Date
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2026, 6, 13])
    // Window unchanged: a day unique to the original week is still shown.
    expect(getByTestId(dayId(2026, 7, 18))).toBeTruthy()
  })

  it("paging forward advances the week without changing the selection", () => {
    const setDate = jest.fn()
    const { getByTestId, queryByTestId } = render(
      <AgendaDateSetter date={wednesday} setDate={setDate} />,
    )

    fireEvent.press(getByTestId("agenda-next-week"))

    expect(setDate).not.toHaveBeenCalled()
    expect(getByTestId(dayId(2026, 7, 22))).toBeTruthy()
    expect(queryByTestId(dayId(2026, 7, 15))).toBeNull()
  })

  it("paging back returns to the original week", () => {
    const setDate = jest.fn()
    const { getByTestId } = render(<AgendaDateSetter date={wednesday} setDate={setDate} />)

    fireEvent.press(getByTestId("agenda-next-week"))
    fireEvent.press(getByTestId("agenda-prev-week"))

    expect(getByTestId(dayId(2026, 7, 15))).toBeTruthy()
    expect(setDate).not.toHaveBeenCalled()
  })

  it("hides the Today pill when today is selected and in view, shows it after paging away", () => {
    const setDate = jest.fn()
    const today = new Date()
    const { getByTestId, queryByTestId } = render(
      <AgendaDateSetter date={today} setDate={setDate} />,
    )

    expect(queryByTestId("agenda-today")).toBeNull()

    fireEvent.press(getByTestId("agenda-next-week"))

    expect(getByTestId("agenda-today")).toBeTruthy()
  })

  it("Today pill returns the selection to today", () => {
    const setDate = jest.fn()
    const { getByTestId } = render(<AgendaDateSetter date={wednesday} setDate={setDate} />)

    fireEvent.press(getByTestId("agenda-today"))

    expect(setDate).toHaveBeenCalledTimes(1)
    const picked = setDate.mock.calls[0][0] as Date
    const now = new Date()
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ])
    // startOfDay: no time-of-day component.
    expect([picked.getHours(), picked.getMinutes(), picked.getSeconds()]).toEqual([0, 0, 0])
  })

  it("re-centers the window when the date prop jumps to another month", () => {
    const setDate = jest.fn()
    const { getByTestId, queryByTestId, rerender } = render(
      <AgendaDateSetter date={wednesday} setDate={setDate} />,
    )
    expect(getByTestId(dayId(2026, 7, 15))).toBeTruthy()

    rerender(<AgendaDateSetter date={new Date(2026, 2, 10)} setDate={setDate} />)

    expect(getByTestId(dayId(2026, 3, 10))).toBeTruthy()
    expect(queryByTestId(dayId(2026, 7, 15))).toBeNull()
  })

  it("keeps the paged week when re-rendered with an equal-valued new Date", () => {
    const setDate = jest.fn()
    const { getByTestId, queryByTestId, rerender } = render(
      <AgendaDateSetter date={wednesday} setDate={setDate} />,
    )

    fireEvent.press(getByTestId("agenda-next-week"))
    expect(getByTestId(dayId(2026, 7, 22))).toBeTruthy()

    // A parent re-render passing a fresh Date object of the same value must not
    // snap the window back — the effect keys on the day's value, not identity.
    rerender(<AgendaDateSetter date={new Date(2026, 6, 15)} setDate={setDate} />)

    expect(getByTestId(dayId(2026, 7, 22))).toBeTruthy()
    expect(queryByTestId(dayId(2026, 7, 15))).toBeNull()
  })

  it("labels a month-straddling week with both month names", () => {
    const setDate = jest.fn()
    const { getByText } = render(
      <AgendaDateSetter date={new Date(2026, 6, 30)} setDate={setDate} />,
    )

    expect(getByText("Jul – Aug 2026")).toBeTruthy()
  })

  it("renders seven distinct days across a week containing a DST transition", () => {
    const setDate = jest.fn()
    // Week around the 2026-03-29 Europe/London spring-forward. addDays is
    // calendar-correct regardless of the host timezone.
    const { getAllByTestId } = render(
      <AgendaDateSetter date={new Date(2026, 2, 29)} setDate={setDate} />,
    )

    const ids = getAllByTestId(/^agenda-day-/).map((node) => node.props.testID)
    expect(new Set(ids).size).toBe(7)
  })

  it("uses the locale's first weekday", () => {
    ;(getDateFnsLocale as jest.Mock).mockReturnValue(es)
    const setDate = jest.fn()
    const { getByTestId, queryByTestId } = render(
      <AgendaDateSetter date={wednesday} setDate={setDate} />,
    )

    // Spanish weeks start on Monday: Jul 13 is the first cell, Jul 12 absent.
    expect(getByTestId(dayId(2026, 7, 13))).toBeTruthy()
    expect(queryByTestId(dayId(2026, 7, 12))).toBeNull()
  })
})
