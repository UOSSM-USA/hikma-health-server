import * as React from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SpeechRecognitionLanguage = "en-US" | "ar-SA" | "en" | "ar";

interface SpeechToTextButtonProps {
  onTranscript: (text: string) => void;
  language?: SpeechRecognitionLanguage;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SpeechToTextButton({
  onTranscript,
  language = "en-US",
  disabled = false,
  className,
  size = "md",
}: SpeechToTextButtonProps) {
  const [isListening, setIsListening] = React.useState(false);
  const [isSupported, setIsSupported] = React.useState(false);
  const recognitionRef = React.useRef<any>(null);
  const pendingTranscriptRef = React.useRef<string>("");

  // Check browser support
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      setIsSupported(!!SpeechRecognition);
    }
  }, []);

  // Initialize speech recognition
  React.useEffect(() => {
    if (typeof window === "undefined" || !isSupported) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      console.log("Speech recognition started");
      setIsListening(true);
      pendingTranscriptRef.current = "";
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      // Store pending transcript for when recognition ends
      if (finalTranscript.trim()) {
        const finalText = finalTranscript.trim();
        pendingTranscriptRef.current = finalText;
        console.log("Speech transcript (final):", finalText);
        onTranscript(finalText);
        toast.success("Text transcribed!", { duration: 2000 });
      } else if (interimTranscript) {
        // Store interim for potential finalization
        pendingTranscriptRef.current = interimTranscript;
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);

      let errorMessage = "Speech recognition error";
      const errorType = event.error;
      if (errorType === "no-speech") {
        errorMessage = "No speech detected. Please try again.";
      } else if (errorType === "audio-capture") {
        errorMessage = "Microphone not found. Please check your microphone.";
      } else if (errorType === "not-allowed") {
        errorMessage = "Microphone permission denied. Please allow microphone access.";
      } else if (errorType === "network") {
        errorMessage = "Network error. Please check your connection.";
      } else if (errorType === "aborted") {
        // User stopped recording, don't show error
        return;
      }

      toast.error(errorMessage);
    };

    recognition.onend = () => {
      console.log("Speech recognition ended, pending transcript:", pendingTranscriptRef.current);
      setIsListening(false);
      // If there's pending transcript that wasn't marked as final, send it now
      if (pendingTranscriptRef.current.trim()) {
        console.log("Sending pending transcript:", pendingTranscriptRef.current);
        onTranscript(pendingTranscriptRef.current.trim());
        pendingTranscriptRef.current = "";
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors when stopping
        }
      }
    };
  }, [language, isSupported, onTranscript]);

  const startListening = () => {
    if (!isSupported) {
      toast.error("Speech recognition is not supported in your browser");
      return;
    }

    if (recognitionRef.current) {
      try {
        console.log("Starting speech recognition with language:", language);
        recognitionRef.current.start();
        toast.info("Listening... Speak now", { duration: 2000 });
      } catch (error: any) {
        if (error.message?.includes("already started") || error.name === "InvalidStateError") {
          // Already listening, ignore
          console.log("Recognition already started");
          return;
        }
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start speech recognition");
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        // Give it a moment to process final results before clearing
        setTimeout(() => {
          if (pendingTranscriptRef.current) {
            onTranscript(pendingTranscriptRef.current);
            pendingTranscriptRef.current = "";
          }
        }, 100);
      } catch (error) {
        console.error("Error stopping speech recognition:", error);
      }
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return null; // Don't show button if not supported
  }

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  return (
    <Button
      type="button"
      variant={isListening ? "destructive" : "outline"}
      size="icon"
      onClick={toggleListening}
      disabled={disabled}
      className={cn(sizeClasses[size], className)}
      title={
        isListening
          ? "Stop recording (click to stop)"
          : "Start voice input (click to speak)"
      }
    >
      {isListening ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
