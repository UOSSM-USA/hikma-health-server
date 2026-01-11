import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { SpeechToTextButton } from "@/components/speech-to-text-button";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  // Size variants
  // size?: "sm" | "md" | "lg";
  // Visual variants
  // variant?: "default" | "filled" | "unstyled";
  // State props
  error?: string | boolean;
  // Icon props
  // leftSection?: React.ReactNode;
  // rightSection?: React.ReactNode;
  // leftSectionPointerEvents?: "none" | "auto";
  // rightSectionPointerEvents?: "none" | "auto";
  // Layout props
  // radius?: "none" | "sm" | "md" | "lg" | "full";
  // Wrapper props
  withAsterisk?: boolean;
  required?: boolean;
  label?: string;
  description?: string;
  // Input wrapper class
  wrapperProps?: React.HTMLAttributes<HTMLDivElement>;
  // Speech-to-text props
  enableSpeechToText?: boolean;
  speechLanguage?: "en-US" | "ar-SA" | "en" | "ar";
  onSpeechTranscript?: (text: string) => void;
}

function Textarea(props: TextareaProps) {
  const {
    className,
    label,
    withAsterisk,
    wrapperProps,
    enableSpeechToText = false,
    speechLanguage = "en-US",
    onSpeechTranscript,
    value,
    onChange,
    ...rest
  } = props;

  const inputId = rest.id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Handle speech transcript
  const handleSpeechTranscript = React.useCallback(
    (transcript: string) => {
      if (onSpeechTranscript) {
        onSpeechTranscript(transcript);
      } else if (onChange && textareaRef.current) {
        // Auto-append transcript to existing value
        const currentValue = (value as string) || "";
        const newValue = currentValue
          ? `${currentValue} ${transcript}`
          : transcript;
        const syntheticEvent = {
          target: { value: newValue },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        onChange(syntheticEvent);
      }
    },
    [onSpeechTranscript, onChange, value],
  );

  return (
    <div className={cn("space-y-1", wrapperProps?.className)}>
      {label && (
        <Label htmlFor={inputId}>
          {label}
          {(withAsterisk || props.required) && (
            <span className="text-destructive">*</span>
          )}
        </Label>
      )}
      <div className="relative">
        <textarea
          ref={textareaRef}
          data-slot="textarea"
          id={inputId}
          className={cn(
            "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            enableSpeechToText && "pr-12",
            className,
          )}
          value={value}
          onChange={onChange}
          {...rest}
        />
        {enableSpeechToText && (
          <div className="absolute right-2 top-2 z-10">
            <SpeechToTextButton
              onTranscript={handleSpeechTranscript}
              language={speechLanguage}
              disabled={rest.disabled}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export { Textarea };
