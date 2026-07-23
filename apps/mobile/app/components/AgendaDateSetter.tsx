import { useEffect, useState } from "react"
import { Pressable, TextStyle, ViewStyle } from "react-native"
import { addDays } from "date-fns/addDays"
import { addWeeks } from "date-fns/addWeeks"
import { format } from "date-fns/format"
import { isSameDay } from "date-fns/isSameDay"
import { isSameMonth } from "date-fns/isSameMonth"
import { isSameWeek } from "date-fns/isSameWeek"
import { isToday } from "date-fns/isToday"
import type { Locale } from "date-fns/locale"
import { startOfDay } from "date-fns/startOfDay"
import { startOfWeek } from "date-fns/startOfWeek"
import i18n from "i18next"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react-native"
import DatePicker from "react-native-date-picker"

import { Text } from "@/components/Text"
import { View } from "@/components/View"
import { isRTL } from "@/i18n"
import { colors } from "@/theme/colors"
import { getDateFnsLocale } from "@/utils/formatDate"

export type AgendaDateSetterProps = {
  date: Date
  setDate: (date: Date) => void
}

const DAYS_IN_WEEK = 7

/**
 * A week-at-a-time date picker. Browsing and selecting are separate actions:
 * the chevrons page the visible week without changing the selection. First
 * weekday and labels follow the active app locale.
 */
export const AgendaDateSetter = ({ date, setDate }: AgendaDateSetterProps) => {
  const locale = getDateFnsLocale()
  const today = startOfDay(new Date())
  const selectedDayMs = startOfDay(date).getTime()

  const [weekStart, setWeekStart] = useState(() => startOfWeek(date, { locale }))
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (!isSameWeek(date, weekStart, { locale })) {
      setWeekStart(startOfWeek(date, { locale }))
    }
    // Omitting weekStart is deliberate: including it would undo every page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayMs])

  const goToPreviousWeek = () => setWeekStart((start) => addWeeks(start, -1))
  const goToNextWeek = () => setWeekStart((start) => addWeeks(start, 1))

  const goToToday = () => {
    setWeekStart(startOfWeek(today, { locale }))
    setDate(today)
  }

  const confirmPickedDate = (picked: Date) => {
    setPickerOpen(false)
    setDate(startOfDay(picked))
  }

  const showTodayButton = !isToday(date) || !isSameWeek(weekStart, today, { locale })

  const PreviousIcon = isRTL ? ChevronRightIcon : ChevronLeftIcon
  const NextIcon = isRTL ? ChevronLeftIcon : ChevronRightIcon

  const days = weekDays(weekStart)

  return (
    <View py={10}>
      <View direction="row" alignItems="center" justifyContent="space-between" style={$headerRow}>
        <Pressable
          testID="agenda-prev-week"
          onPress={goToPreviousWeek}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <PreviousIcon size={20} color={colors.text} />
        </Pressable>

        <Pressable
          testID="agenda-month"
          onPress={() => setPickerOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text text={monthLabel(weekStart, locale)} size="xs" align="center" />
        </Pressable>

        <Pressable
          testID="agenda-next-week"
          onPress={goToNextWeek}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <NextIcon size={20} color={colors.text} />
        </Pressable>
      </View>

      <View direction="row" justifyContent="space-around" style={$datesContainer}>
        {days.map((day) => {
          const selected = isSameDay(day, date)
          return (
            <Pressable
              key={dayKey(day)}
              testID={`agenda-day-${dayKey(day)}`}
              onPress={() => setDate(startOfDay(day))}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[$dateItem, selected ? $activeDate : null, isToday(day) ? $todayDate : null]}
            >
              <Text
                size="xxs"
                color={selected ? colors.palette.neutral100 : colors.textDim}
                text={format(day, "EEEEE", { locale })}
              />
              <Text
                color={selected ? colors.palette.neutral100 : colors.text}
                text={format(day, "d", { locale })}
              />
            </Pressable>
          )
        })}
      </View>

      {showTodayButton && (
        <Pressable
          testID="agenda-today"
          onPress={goToToday}
          hitSlop={8}
          accessibilityRole="button"
          style={$todayLink}
        >
          <Text
            tx="common:today"
            size="sm"
            color={colors.palette.primary500}
            style={$todayLinkText}
          />
        </Pressable>
      )}

      <DatePicker
        modal
        mode="date"
        open={pickerOpen}
        date={date}
        locale={i18n.language ?? "en"}
        onConfirm={confirmPickedDate}
        onCancel={() => setPickerOpen(false)}
      />
    </View>
  )
}

function weekDays(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let offset = 0; offset < DAYS_IN_WEEK; offset++) {
    days.push(addDays(weekStart, offset))
  }
  return days
}

/** "July 2026" within one month, "Jul – Aug 2026" / "Dec 2026 – Jan 2027" across a boundary. */
function monthLabel(weekStart: Date, locale: Locale | undefined): string {
  const weekEnd = addDays(weekStart, DAYS_IN_WEEK - 1)
  if (isSameMonth(weekStart, weekEnd)) {
    return format(weekStart, "MMMM yyyy", { locale })
  }
  if (weekStart.getFullYear() === weekEnd.getFullYear()) {
    return `${format(weekStart, "MMM", { locale })} – ${format(weekEnd, "MMM yyyy", { locale })}`
  }
  return `${format(weekStart, "MMM yyyy", { locale })} – ${format(weekEnd, "MMM yyyy", { locale })}`
}

/** Locale-invariant yyyy-MM-dd from a date's local calendar parts, for keys and testIDs. */
function dayKey(day: Date): string {
  const year = day.getFullYear()
  const month = String(day.getMonth() + 1).padStart(2, "0")
  const dayOfMonth = String(day.getDate()).padStart(2, "0")
  return `${year}-${month}-${dayOfMonth}`
}

const $headerRow: ViewStyle = {
  minHeight: 28,
  paddingHorizontal: 4,
}

const $todayLink: ViewStyle = {
  alignSelf: "center",
  paddingVertical: 8,
  paddingHorizontal: 12,
  marginTop: 4,
}

const $todayLinkText: TextStyle = {
  textDecorationLine: "underline",
}

const $dateItem: ViewStyle = {
  flex: 1,
  alignItems: "center",
  paddingVertical: 8,
  marginHorizontal: 2,
  borderRadius: 10,
}

const $activeDate: ViewStyle = {
  backgroundColor: colors.palette.primary500,
}

const $todayDate: ViewStyle = {
  borderColor: colors.palette.neutral400,
  borderWidth: 1,
}

const $datesContainer: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingVertical: 4,
  paddingHorizontal: 2,
  marginTop: 6,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
  borderRadius: 10,
}
