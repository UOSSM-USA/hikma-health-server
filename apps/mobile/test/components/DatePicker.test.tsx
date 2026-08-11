import React from "react"
import { act, fireEvent } from "@testing-library/react-native"

import { DatePickerButton } from "../../app/components/DatePicker"
import { render } from "../helpers/renderWithProviders"

// Capture the props handed to the native picker on EVERY render, so assertions
// read the current `open` value rather than a stale first-render one.
const propsLog: any[] = []

jest.mock("react-native-date-picker", () => ({
  __esModule: true,
  default: (props: any) => {
    propsLog.push(props)
    return null
  },
}))

const latest = () => propsLog[propsLog.length - 1]

describe("DatePickerButton", () => {
  beforeEach(() => {
    propsLog.length = 0
  })

  it("closes itself after a caller-supplied onConfirm fires", () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(
      <DatePickerButton date={new Date(2000, 0, 15)} onConfirm={onConfirm} />,
    )

    expect(latest().open).toBe(false)

    fireEvent.press(getByTestId("DatePickerButton"))
    expect(latest().open).toBe(true)

    act(() => latest().onConfirm(new Date(1990, 5, 2)))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    // The native dialog dismisses itself; JS state must agree, or the next tap
    // toggles `open` back to false and silently does nothing.
    expect(latest().open).toBe(false)
  })

  it("reopens on the very next press after a confirm", () => {
    const { getByTestId } = render(
      <DatePickerButton date={new Date(2000, 0, 15)} onConfirm={jest.fn()} />,
    )

    fireEvent.press(getByTestId("DatePickerButton"))
    act(() => latest().onConfirm(new Date(1990, 5, 2)))

    fireEvent.press(getByTestId("DatePickerButton"))
    expect(latest().open).toBe(true)
  })

  it("still closes and reports when the caller supplies only onDateChange", () => {
    const onDateChange = jest.fn()
    const { getByTestId } = render(
      <DatePickerButton date={new Date(2000, 0, 15)} onDateChange={onDateChange} />,
    )

    fireEvent.press(getByTestId("DatePickerButton"))
    const picked = new Date(1990, 5, 2)
    act(() => latest().onConfirm(picked))

    expect(onDateChange).toHaveBeenCalledWith(picked)
    expect(latest().open).toBe(false)
  })

  it("closes on cancel and forwards the caller's onCancel", () => {
    const onCancel = jest.fn()
    const { getByTestId } = render(
      <DatePickerButton date={new Date(2000, 0, 15)} onCancel={onCancel} />,
    )

    fireEvent.press(getByTestId("DatePickerButton"))
    expect(latest().open).toBe(true)

    act(() => latest().onCancel())

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(latest().open).toBe(false)
  })
})
