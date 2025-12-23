import React, { createContext, useContext, useState, useEffect } from "react";

type ClinicContextType = {
  selectedClinicId: string | "all" | null;
  setSelectedClinicId: (clinicId: string | "all" | null) => void;
};

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ 
  children,
  defaultClinicId,
  isSuperAdmin,
  accessibleClinicIds = []
}: { 
  children: React.ReactNode;
  defaultClinicId?: string | "all" | null;
  isSuperAdmin: boolean;
  accessibleClinicIds?: string[]; // Clinic IDs the user has access to (for non-super admins)
}) {
  // Initialize state - check localStorage first, then use default
  const getInitialValue = (): string | "all" | null => {
    if (typeof window === "undefined") {
      const initial = defaultClinicId || (isSuperAdmin ? "all" : null);
      // Validate initial value for non-super admins
      if (!isSuperAdmin && initial && initial !== "all" && !accessibleClinicIds.includes(initial)) {
        return accessibleClinicIds.length > 0 ? accessibleClinicIds[0] : null;
      }
      return initial;
    }
    const stored = localStorage.getItem("selectedClinicId");
    if (stored) {
      // Only use "all" if super admin
      if (stored === "all" && !isSuperAdmin) {
        const fallback = defaultClinicId || (accessibleClinicIds.length > 0 ? accessibleClinicIds[0] : null);
        return fallback;
      }
      // Validate stored clinic ID for non-super admins
      if (!isSuperAdmin && stored !== "all" && !accessibleClinicIds.includes(stored)) {
        return accessibleClinicIds.length > 0 ? accessibleClinicIds[0] : (defaultClinicId || null);
      }
      return stored === "all" ? "all" : stored;
    }
    const initial = defaultClinicId || (isSuperAdmin ? "all" : null);
    // Validate initial value for non-super admins
    if (!isSuperAdmin && initial && initial !== "all" && !accessibleClinicIds.includes(initial)) {
      return accessibleClinicIds.length > 0 ? accessibleClinicIds[0] : null;
    }
    return initial;
  };

  const [selectedClinicId, setSelectedClinicIdState] = useState<string | "all" | null>(getInitialValue);

  // Validate and update if accessible clinic IDs change
  useEffect(() => {
    if (!isSuperAdmin && selectedClinicId && selectedClinicId !== "all") {
      if (!accessibleClinicIds.includes(selectedClinicId)) {
        // User's accessible clinics changed, reset to first available or default
        const newValue = accessibleClinicIds.length > 0 ? accessibleClinicIds[0] : (defaultClinicId || null);
        setSelectedClinicIdState(newValue);
      }
    }
  }, [accessibleClinicIds, isSuperAdmin, defaultClinicId, selectedClinicId]);

  // Persist to localStorage
  useEffect(() => {
    if (selectedClinicId !== null && typeof window !== "undefined") {
      localStorage.setItem("selectedClinicId", selectedClinicId === "all" ? "all" : selectedClinicId);
    }
  }, [selectedClinicId]);

  const setSelectedClinicId = (clinicId: string | "all" | null) => {
    // Validate clinic selection for non-super admins
    if (!isSuperAdmin) {
      if (clinicId === "all") {
        // Non-super admins can't select "all"
        console.warn("Non-super admins cannot select 'all' clinics");
        return;
      }
      if (clinicId && !accessibleClinicIds.includes(clinicId)) {
        // User trying to select a clinic they don't have access to
        console.warn(`User does not have access to clinic ${clinicId}`);
        return;
      }
    }
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
