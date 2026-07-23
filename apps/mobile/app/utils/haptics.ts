import { Vibration } from "react-native"

// Duration is honored on Android; iOS plays a fixed system vibration and
// ignores the value. Kept short so the Android buzz reads as a tap confirmation.
const TAP_DURATION_MS = 20

/** Brief vibration confirming a button press was registered. */
export const hapticTap = (): void => {
  Vibration.vibrate(TAP_DURATION_MS)
}
