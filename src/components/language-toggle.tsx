/**
 * Language Toggle Component
 * Allows users to switch between English and Arabic
 * Toggle only affects current session - does not change default preference
 */

import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage, useTranslation } from "@/lib/i18n/context";
import { supportedLanguages } from "@/lib/i18n/translations";
import { useState } from "react";
import { toast } from "sonner";

export function LanguageToggle() {
  const { language, setLanguage, saveAsDefault } = useLanguage();
  const t = useTranslation();
  const [isSaving, setIsSaving] = useState(false);

  const handleLanguageChange = (value: "en" | "ar") => {
    // Immediately update the language for current session
    setLanguage(value);
  };

  const handleSaveAsDefault = async () => {
    setIsSaving(true);
    try {
      await saveAsDefault();
      toast.success(
        t("messages.languageSaved") || "Language preference saved as default"
      );
    } catch (error) {
      toast.error(
        t("messages.languageSaveError") || "Failed to save language preference"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <Select value={language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("language.selectLanguage")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t("language.english")}</SelectItem>
            <SelectItem value="ar">{t("language.arabic")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <button
        onClick={handleSaveAsDefault}
        disabled={isSaving}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
        title={t("language.saveAsDefault") || "Save as default language"}
      >
        {isSaving
          ? t("common.loading") || "Saving..."
          : t("language.saveAsDefault") || "Save as default"}
      </button>
    </div>
  );
}

