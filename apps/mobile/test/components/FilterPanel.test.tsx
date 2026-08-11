import { fireEvent } from "@testing-library/react-native"

import { FilterPanel } from "../../app/components/FilterPanel"
import { Text } from "../../app/components/Text"
import { render } from "../helpers/renderWithProviders"

const chip = (key: string, label: string, onRemove = jest.fn()) => ({ key, label, onRemove })

const renderPanel = (props: Partial<React.ComponentProps<typeof FilterPanel>> = {}) =>
  render(
    <FilterPanel chips={[]} onClearAll={jest.fn()} {...props}>
      <Text testID="filter-controls" text="Controls" />
    </FilterPanel>,
  )

describe("FilterPanel", () => {
  it("starts collapsed so the list, not the filters, owns the screen", () => {
    const { queryByTestId } = renderPanel()
    expect(queryByTestId("filter-controls")).toBeNull()
  })

  it("reveals the controls when expanded, and hides them again", () => {
    const { queryByTestId, getByTestId } = renderPanel()

    fireEvent.press(getByTestId("filter-panel-toggle"))
    expect(queryByTestId("filter-controls")).not.toBeNull()

    fireEvent.press(getByTestId("filter-panel-toggle"))
    expect(queryByTestId("filter-controls")).toBeNull()
  })

  it("offers no count or clear-all when nothing is filtered", () => {
    const { queryByTestId } = renderPanel()
    expect(queryByTestId("filter-panel-count")).toBeNull()
    expect(queryByTestId("filter-panel-clear-all")).toBeNull()
  })

  it("shows a chip per active filter, with the count", () => {
    const { getByTestId } = renderPanel({
      chips: [chip("country:Kenya", "Kenya"), chip("city:Nairobi", "Nairobi")],
    })

    expect(getByTestId("filter-panel-count")).toHaveTextContent("2")
    expect(getByTestId("filter-panel-chip-country:Kenya")).toBeTruthy()
    expect(getByTestId("filter-panel-chip-city:Nairobi")).toBeTruthy()
  })

  it("removes only the chip that was pressed", () => {
    const removeCountry = jest.fn()
    const removeCity = jest.fn()
    const { getByTestId } = renderPanel({
      chips: [
        chip("country:Kenya", "Kenya", removeCountry),
        chip("city:Nairobi", "Nairobi", removeCity),
      ],
    })

    fireEvent.press(getByTestId("filter-panel-chip-country:Kenya"))

    expect(removeCountry).toHaveBeenCalledTimes(1)
    expect(removeCity).not.toHaveBeenCalled()
  })

  it("clears everything from the clear-all action", () => {
    const onClearAll = jest.fn()
    const { getByTestId } = renderPanel({ chips: [chip("country:Kenya", "Kenya")], onClearAll })

    fireEvent.press(getByTestId("filter-panel-clear-all"))

    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it("hides the chips while expanded, since the controls already show them", () => {
    const { queryByTestId, getByTestId } = renderPanel({ chips: [chip("country:Kenya", "Kenya")] })

    fireEvent.press(getByTestId("filter-panel-toggle"))

    expect(queryByTestId("filter-panel-chip-country:Kenya")).toBeNull()
    // The count stays visible so the badge does not flicker on expand.
    expect(getByTestId("filter-panel-count")).toHaveTextContent("1")
  })
})
