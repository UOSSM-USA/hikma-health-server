import * as React from "react";
import { Mic, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SpeechToTextButton } from "@/components/speech-to-text-button";

type SpeechLanguage = "en-US" | "ar-SA";

interface SpeechInputWithLanguageProps {
  onEnglishTranscript: (text: string) => void;
  onArabicTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SpeechInputWithLanguage({
  onEnglishTranscript,
  onArabicTranscript,
  disabled = false,
  className,
}: SpeechInputWithLanguageProps) {
  const [selectedLanguage, setSelectedLanguage] = React.useState<SpeechLanguage>("en-US");

  const handleTranscript = React.useCallback(
    (transcript: string) => {
      if (selectedLanguage === "en-US") {
        onEnglishTranscript(transcript);
      } else {
        onArabicTranscript(transcript);
      }
    },
    [selectedLanguage, onEnglishTranscript, onArabicTranscript],
  );

  const languageLabels = {
    "en-US": "English",
    "ar-SA": "Arabic | العربية",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="flex items-center gap-2"
          >
            <Languages className="h-4 w-4" />
            <span className="text-xs">{languageLabels[selectedLanguage]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setSelectedLanguage("en-US")}
            className={selectedLanguage === "en-US" ? "bg-accent" : ""}
          >
            English
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setSelectedLanguage("ar-SA")}
            className={selectedLanguage === "ar-SA" ? "bg-accent" : ""}
          >
            Arabic | العربية
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SpeechToTextButton
        onTranscript={handleTranscript}
        language={selectedLanguage}
        disabled={disabled}
        size="sm"
      />
    </div>
  );
}
