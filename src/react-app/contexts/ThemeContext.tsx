import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "default" | "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("kasshi_theme");
    return (saved as Theme) || "default";
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("kasshi_theme", newTheme);
  };

  useEffect(() => {
    // Remove all theme classes first
    document.documentElement.classList.remove("theme-default", "theme-dark", "theme-light");
    
    // Add the current theme class
    if (theme !== "default") {
      document.documentElement.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
