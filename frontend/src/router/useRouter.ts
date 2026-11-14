import { useEffect, useState, useCallback, useTransition } from "react";

export type AppRoute = "/" | "/methodology" | "/contact" | "/privacy" | "/terms" | "/404";

const ROUTE_METADATA: Record<string, { title: string; description: string }> = {
  "/": {
    title: "WETHAREPOT — Urban Flood Intelligence & Hydrologic Cartography",
    description: "High-resolution 2D shallow water equation solver & real-time hydrologic flood simulation across Bengaluru catchments.",
  },
  "/methodology": {
    title: "Methodology & Physical Specification — WETHAREPOT",
    description: "Mathematical formulation of the 2D Shallow Water Equations, Rusanov numerical fluxes, DEM processing, and neural surrogate validation.",
  },
  "/contact": {
    title: "Research Contact & Inquiries — WETHAREPOT",
    description: "Official contact details and research collaboration avenues for the WETHAREPOT urban flood simulation project.",
  },
  "/privacy": {
    title: "Privacy & Data Policy — WETHAREPOT",
    description: "Information collection and local functional storage disclosures for the WETHAREPOT hydrologic instrument.",
  },
  "/terms": {
    title: "Terms of Scientific Usage — WETHAREPOT",
    description: "Operational parameters, research use limitations, and disclaimers for urban flood predictive simulations.",
  },
  "/404": {
    title: "404 Uncharted Coordinates — WETHAREPOT",
    description: "The requested spatial coordinate or route lies outside the modeled urban grid boundary.",
  },
};

function normalizePath(pathname: string): AppRoute {
  // If running with hash routing (e.g. #/methodology)
  const hash = window.location.hash.replace(/^#/, "");
  const target = hash ? hash : pathname;
  const clean = target.replace(/\/+$/, "") || "/";

  if (clean === "/" || clean === "") return "/";
  if (clean === "/methodology") return "/methodology";
  if (clean === "/contact") return "/contact";
  if (clean === "/privacy") return "/privacy";
  if (clean === "/terms") return "/terms";
  return "/404";
}

export function useRouter() {
  const [currentPath, setCurrentPath] = useState<AppRoute>(() =>
    normalizePath(window.location.pathname)
  );
  const [, startTransition] = useTransition();

  const updateMeta = useCallback((path: AppRoute) => {
    const meta = ROUTE_METADATA[path] || ROUTE_METADATA["/404"];
    document.title = meta.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", meta.description);
    }
  }, []);

  const navigate = useCallback(
    (to: string) => {
      startTransition(() => {
        window.history.pushState({}, "", to);
        const resolved = normalizePath(to);
        setCurrentPath(resolved);
        updateMeta(resolved);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    [updateMeta]
  );

  useEffect(() => {
    const handlePopState = () => {
      const resolved = normalizePath(window.location.pathname);
      setCurrentPath(resolved);
      updateMeta(resolved);
    };

    window.addEventListener("popstate", handlePopState);
    updateMeta(currentPath);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentPath, updateMeta]);

  return { currentPath, navigate };
}
