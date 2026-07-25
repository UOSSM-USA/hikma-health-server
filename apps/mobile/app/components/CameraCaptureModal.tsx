import { useRef, useState } from "react"
import { ActivityIndicator, Alert, Modal, Pressable, ViewStyle } from "react-native"
import { CameraType, CameraView } from "expo-camera"
import { LucideRefreshCw, LucideX } from "lucide-react-native"
import { Logger } from "@hikmahealth/js-utils"

import { Text } from "@/components/Text"
import { View } from "@/components/View"
import { colors } from "@/theme/colors"

export interface CameraCaptureModalProps {
  visible: boolean
  /** Receives the cache URI of the captured JPEG. */
  onCapture: (uri: string) => void
  onClose: () => void
  /** Shown above the shutter so the user knows what they are photographing. */
  label?: string
  quality?: number
}

/**
 * Full-screen camera with a shutter, a close control, and a front/back toggle.
 *
 * The caller owns the captured file from `onCapture` onward, including deleting
 * it when done with it.
 */
export function CameraCaptureModal({
  visible,
  onCapture,
  onClose,
  label,
  quality = 0.7,
}: CameraCaptureModalProps) {
  const cameraRef = useRef<CameraView>(null)
  const [facing, setFacing] = useState<CameraType>("back")
  const [isCapturing, setIsCapturing] = useState(false)

  const takePhoto = async () => {
    if (isCapturing) return
    setIsCapturing(true)
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality })
      if (photo?.uri) onCapture(photo.uri)
    } catch (error: unknown) {
      // Stay open on failure so the shot can be retried without reopening.
      Logger.error({ msg: "Photo capture failed", error })
      Alert.alert("Camera", "Could not take the photo. Please try again.")
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={$container}>
        <CameraView ref={cameraRef} style={$camera} facing={facing} />

        <View style={$header} direction="row" justifyContent="space-between" alignItems="center">
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close camera">
            <LucideX size={28} color={colors.palette.neutral100} />
          </Pressable>
          {label ? <Text text={label} color={colors.palette.neutral100} /> : null}
          <Pressable
            onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
            hitSlop={12}
            accessibilityLabel="Switch camera"
          >
            <LucideRefreshCw size={24} color={colors.palette.neutral100} />
          </Pressable>
        </View>

        <View style={$controls} alignItems="center">
          <Pressable
            onPress={takePhoto}
            disabled={isCapturing}
            style={$shutter}
            accessibilityLabel="Take photo"
          >
            {isCapturing ? <ActivityIndicator color={colors.palette.neutral800} /> : null}
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const $container: ViewStyle = {
  flex: 1,
  backgroundColor: colors.palette.neutral900,
}

const $camera: ViewStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}

const $header: ViewStyle = {
  paddingTop: 56,
  paddingHorizontal: 20,
}

const $controls: ViewStyle = {
  position: "absolute",
  bottom: 48,
  left: 0,
  right: 0,
}

const $shutter: ViewStyle = {
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: colors.palette.neutral100,
  borderWidth: 4,
  borderColor: colors.palette.neutral400,
  alignItems: "center",
  justifyContent: "center",
}
