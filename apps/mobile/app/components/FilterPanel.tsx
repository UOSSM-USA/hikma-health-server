import { FC, ReactNode, useState } from "react"
import { Pressable, TextStyle, ViewStyle } from "react-native"
import { LucideChevronDown, LucideChevronUp, LucideX } from "lucide-react-native"

import { Text } from "@/components/Text"
import { View } from "@/components/View"
import { translate } from "@/i18n/translate"
import { colors } from "@/theme/colors"

export type FilterPanelChip = {
  key: string
  label: string
  onRemove: () => void
}

export type FilterPanelProps = {
  /** Active filters only — an empty list hides the count, chips and "clear all". */
  chips: FilterPanelChip[]
  onClearAll: () => void
  /** The full filter controls, revealed when expanded. */
  children: ReactNode
}

/**
 * Collapsible filter header shared by the list screens.
 *
 * Collapsed by default so the list, not the filters, owns the screen. Every
 * active filter still shows as an individually removable chip while collapsed,
 * so narrowing down does not force a trip back into the controls.
 */
export const FilterPanel: FC<FilterPanelProps> = ({ chips, onClearAll, children }) => {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const hasActiveFilters = chips.length > 0

  return (
    <View>
      <View direction="row" alignItems="center" justifyContent="space-between">
        <Pressable
          testID="filter-panel-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: !isCollapsed }}
          style={$toggle}
          onPress={() => setIsCollapsed((collapsed) => !collapsed)}
        >
          <Text preset="formLabel" text={translate("common:advancedFilters")} />
          {hasActiveFilters && (
            <View style={$countBadge}>
              <Text
                testID="filter-panel-count"
                text={String(chips.length)}
                size="xxs"
                style={$countBadgeText}
              />
            </View>
          )}
          {isCollapsed ? (
            <LucideChevronDown size={20} color={colors.palette.primary700} />
          ) : (
            <LucideChevronUp size={20} color={colors.palette.primary700} />
          )}
        </Pressable>

        {hasActiveFilters && (
          <Pressable testID="filter-panel-clear-all" onPress={onClearAll}>
            <Text
              text={translate("common:clearFilters")}
              size="xs"
              color={colors.palette.primary700}
            />
          </Pressable>
        )}
      </View>

      {isCollapsed && hasActiveFilters && (
        <View direction="row" flexWrap="wrap" gap={6} mt={8}>
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              testID={`filter-panel-chip-${chip.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
              style={$chip}
              onPress={chip.onRemove}
            >
              <Text text={chip.label} size="xxs" style={$chipText} />
              <LucideX size={12} color={colors.palette.neutral800} />
            </Pressable>
          ))}
        </View>
      )}

      {!isCollapsed && <View mt={4}>{children}</View>}
    </View>
  )
}

const $toggle: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingVertical: 4,
}

const $countBadge: ViewStyle = {
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  paddingHorizontal: 5,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.palette.primary500,
}

const $countBadgeText: TextStyle = {
  color: colors.palette.neutral100,
  lineHeight: 18,
}

const $chip: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  paddingVertical: 4,
  paddingHorizontal: 8,
  borderRadius: 12,
  borderWidth: 1,
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.palette.neutral400,
}

const $chipText: TextStyle = {
  color: colors.palette.neutral800,
}
