import { useState } from "react"
import { Alert, TouchableOpacity, ViewStyle } from "react-native"

import { useNavigation } from "@react-navigation/native"

import type { AppStackParamList } from "@/navigators/AppNavigator"

import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { View } from "@/components/View"
import {
  SYNC_RANGES,
  rangeToSinceDays,
  type SyncRangeId,
} from "@/screens/syncSettingsHelpers"
import { colors } from "@/theme/colors"

/**
 * "Sync from…" — pick a range and hand off to the blocking run.
 *
 * Replaces the Upload/Download pair, which asked for a typed `YYYY-MM-DD` and
 * treated anything it could not parse as "the beginning of time" while telling
 * the user it had understood them. Ranges are chosen from a fixed list, and the
 * one free-text field rejects what it cannot read instead of widening.
 *
 * Only rendered for an active cloud peer. A peer taken out of rotation must not
 * receive the device's record store.
 */
export function ManualSyncActions({ serverId }: { serverId: string }) {
  // Typed against the real param list rather than `screen: string`, so a route
  // rename or a params change fails here instead of at the first tap.
  const navigation = useNavigation<{
    navigate: <T extends keyof AppStackParamList>(screen: T, params: AppStackParamList[T]) => void
  }>()
  const [expanded, setExpanded] = useState(false)
  const [customDays, setCustomDays] = useState("")

  const go = (sinceDays: number | null) => {
    setExpanded(false)
    navigation.navigate("ManualSync", { peerId: serverId, sinceDays })
  }

  const confirm = (label: string, sinceDays: number | null) => {
    // "Everything" is the only range whose cost is unbounded, and the only one
    // a user can pick without realising what they have asked for.
    const message =
      sinceDays === null
        ? "This downloads every record on the server. It can take a long time and use significant data. Continue?"
        : `This uploads your pending changes, then downloads everything changed in the last ${sinceDays} day${sinceDays === 1 ? "" : "s"}.`

    Alert.alert(`Sync from ${label}`, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Sync", onPress: () => go(sinceDays) },
    ])
  }

  const selectPreset = (id: SyncRangeId, label: string) => {
    confirm(label, rangeToSinceDays(id))
  }

  const selectCustom = () => {
    try {
      const days = rangeToSinceDays("custom", Number(customDays))
      confirm(`the last ${days} days`, days)
    } catch (error) {
      Alert.alert("Invalid number of days", (error as Error).message)
    }
  }

  return (
    <View pt={8} direction="column" gap={6}>
      <TouchableOpacity style={$toggle} onPress={() => setExpanded((open) => !open)}>
        <Text text="Sync from…" size="xxs" color={colors.palette.primary600} />
      </TouchableOpacity>

      {expanded && (
        <View direction="column" gap={4}>
          {SYNC_RANGES.map((range) => (
            <TouchableOpacity
              key={range.id}
              style={$option}
              onPress={() => selectPreset(range.id, range.label)}
            >
              <Text text={range.label} size="xxs" />
            </TouchableOpacity>
          ))}

          <TextField
            label="Other — number of days"
            value={customDays}
            onChangeText={setCustomDays}
            keyboardType="number-pad"
            placeholder="e.g. 45"
            placeholderTextColor={colors.palette.neutral400}
          />

          <TouchableOpacity style={$option} onPress={selectCustom}>
            <Text text="Sync that many days" size="xxs" color={colors.palette.primary600} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const $toggle: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingVertical: 6,
}

const $option: ViewStyle = {
  paddingVertical: 8,
  paddingHorizontal: 10,
  borderRadius: 6,
  borderWidth: 1,
  borderColor: colors.border,
}
