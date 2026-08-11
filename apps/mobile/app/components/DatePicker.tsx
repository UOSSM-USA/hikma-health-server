import React, { useState } from "react"
import { Pressable, ViewStyle } from "react-native"
import { format } from "date-fns"
import DatePicker, { DatePickerProps } from "react-native-date-picker"

import { colors } from "@/theme/colors"

import { Text } from "./Text"

type CustomDatePickerProps = DatePickerProps & {
  disabled?: boolean
}

export const DatePickerButton = ({ date, onDateChange, ...rest }: CustomDatePickerProps) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Pressable
        style={$datePicker}
        testID="DatePickerButton"
        disabled={rest.disabled}
        onPress={() => setOpen((open) => !open)}
      >
        <Text>{format(date, "do MMMM yyyy")}</Text>
      </Pressable>
      {/*
        `rest` is spread FIRST on purpose. Spread last, a caller's `onConfirm`
        replaces the handler below and drops its `setOpen(false)`. The native
        dialog dismisses itself, so `open` stays true and the next tap toggles
        it back to false instead of reopening — one dead tap per confirm.
      */}
      <DatePicker
        locale="jp"
        modal
        mode="date"
        {...rest}
        open={open}
        date={date}
        onDateChange={onDateChange}
        onConfirm={(date: Date) => {
          setOpen(false)
          date && (rest.onConfirm ?? onDateChange)?.(date)
        }}
        onCancel={() => {
          setOpen(false)
          rest.onCancel?.()
        }}
      />
    </>
  )
}

const $datePicker: ViewStyle = {
  marginTop: 10,
  paddingHorizontal: 10,
  paddingVertical: 12,
  width: "100%",
  flex: 1,
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.palette.neutral400,
  borderWidth: 1,
  borderRadius: 4,
  justifyContent: "center",
}
