import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@getmocha/users-service/react";

interface PasswordGateContextType {
  isPasswordVerified: boolean;
  requiresPasswordOnLogin: boolean;
  isCheckingRequirement: boolean;
  verifyPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordGate: () => void;
}

const PasswordGateContext = createContext<PasswordGateContextType | null>(null);

export function PasswordGateProvider({ children }: { children: ReactNode }) {
  const { user, isPending: authPending } = useAuth();
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [requiresPasswordOnLogin, setRequiresPasswordOnLogin] = useState(false);
  const [isCheckingRequirement, setIsCheckingRequirement] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  // Check if user requires password on login
  useEffect(() => {
    if (authPending) return;

    if (!user) {
      // User not logged in - reset state and clear session storage
      setIsPasswordVerified(false);
      setRequiresPasswordOnLogin(false);
      setIsCheckingRequirement(false);
      localStorage.removeItem("kasshi_password_verified");
      localStorage.removeItem("kasshi_verified_user_id");
      lastUserIdRef.current = null;
      return;
    }

    // Check if user changed - if so, reset verification
    const storedUserId = localStorage.getItem("kasshi_verified_user_id");
    if (storedUserId && storedUserId !== user.id) {
      // Different user logged in - clear old verification
      localStorage.removeItem("kasshi_password_verified");
      localStorage.removeItem("kasshi_verified_user_id");
      setIsPasswordVerified(false);
    }
    
    // Track current user
    lastUserIdRef.current = user.id;

    // Check the session storage for this session's verification status
    const sessionVerified = localStorage.getItem("kasshi_password_verified");
    const verifiedUserId = localStorage.getItem("kasshi_verified_user_id");
    if (sessionVerified === "true" && verifiedUserId === user.id) {
      setIsPasswordVerified(true);
    } else {
      // Reset if user doesn't match
      setIsPasswordVerified(false);
    }

    // Check if password is required
    const checkRequirement = async () => {
      setIsCheckingRequirement(true);
      try {
        const res = await fetch("/api/security/status");
        if (res.ok) {
          const data = await res.json();
          const requires = !!(data.isExtraPasswordEnabled && data.requirePasswordOnLogin);
          setRequiresPasswordOnLogin(requires);
          
          // If password not required, auto-verify
          if (!requires) {
            setIsPasswordVerified(true);
          }
        } else {
          // If we can't check status, assume no password required
          setRequiresPasswordOnLogin(false);
          setIsPasswordVerified(true);
        }
      } catch (error) {
        console.error("Failed to check password requirement:", error);
        setRequiresPasswordOnLogin(false);
        setIsPasswordVerified(true);
      } finally {
        setIsCheckingRequirement(false);
      }
    };

    checkRequirement();
  }, [user, authPending]);

  const verifyPassword = async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/security/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraPassword: password }),
      });

      const data = await res.json();

      if (res.ok && data.verified) {
        setIsPasswordVerified(true);
        localStorage.setItem("kasshi_password_verified", "true");
        // Store which user was verified to prevent cross-user session issues
        if (user) {
          localStorage.setItem("kasshi_verified_user_id", user.id);
        }
        return { success: true };
      } else {
        return { success: false, error: data.error || "Invalid password" };
      }
    } catch (error) {
      console.error("Password verification error:", error);
      return { success: false, error: "Verification failed" };
    }
  };

  const resetPasswordGate = () => {
    setIsPasswordVerified(false);
    localStorage.removeItem("kasshi_password_verified");
  };

  return (
    <PasswordGateContext.Provider
      value={{
        isPasswordVerified,
        requiresPasswordOnLogin,
        isCheckingRequirement,
        verifyPassword,
        resetPasswordGate,
      }}
    >
      {children}
    </PasswordGateContext.Provider>
  );
}

export function usePasswordGate() {
  const context = useContext(PasswordGateContext);
  if (!context) {
    throw new Error("usePasswordGate must be used within a PasswordGateProvider");
  }
  return context;
}
