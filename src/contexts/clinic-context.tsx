import React, { createContext, useContext, useState, useEffect } from "react";

type ClinicContextType = {
  selectedClinicId: string | "all" | null;
  setSelectedClinicId: (clinicId: string | "all" | null) => void;
};

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ 
  children,
  defaultClinicId,
  isSuperAdmin 
}: { 
  children: React.ReactNode;
  defaultClinicId?: string | "all" | null;
  isSuperAdmin: boolean;
}) {
  // Initialize state - check localStorage first, then use default
  const getInitialValue = (): string | "all" | null => {
    if (typeof window === "undefined") {
      return defaultClinicId || (isSuperAdmin ? "all" : null);
    }
    const stored = localStorage.getItem("selectedClinicId");
    if (stored) {
      // Only use "all" if super admin
      if (stored === "all" && !isSuperAdmin) {
        return defaultClinicId || null;
      }
      return stored === "all" ? "all" : stored;
    }
    return defaultClinicId || (isSuperAdmin ? "all" : null);
  };

  const [selectedClinicId, setSelectedClinicIdState] = useState<string | "all" | null>(getInitialValue);

  // Persist to localStorage
  useEffect(() => {
    if (selectedClinicId !== null && typeof window !== "undefined") {
      localStorage.setItem("selectedClinicId", selectedClinicId === "all" ? "all" : selectedClinicId);
    }
  }, [selectedClinicId]);

  const setSelectedClinicId = (clinicId: string | "all" | null) => {
    setSelectedClinicIdState(clinicId);
  };

  return (
    <ClinicContext.Provider value={{ selectedClinicId, setSelectedClinicId }}>
      {children}
    </ClinicContext.Provider>
  );
}

export function useClinicContext() {
  const context = useContext(ClinicContext);
  if (context === undefined) {
    throw new Error("useClinicContext must be used within a ClinicProvider");
  }
  return context;
}
