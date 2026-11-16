import React, { useState, useEffect, useRef, useCallback } from "react";

export interface SearchResult {
  place_id: number | string;
  display_name: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  category?: string;
}

interface CitySearchBoxProps {
  onSelectLocation: (lat: number, lon: number, name: string) => void;
  className?: string;
}

// Curated high-priority Bengaluru landmarks, lakes, and tech corridors for instant zero-latency suggestions
const CURATED_BENGALURU_PLACES: SearchResult[] = [
  { place_id: "bellandur_lake", name: "Bellandur Lake", display_name: "Bellandur Lake, Outer Ring Road, Bengaluru", lat: 12.9352, lon: 77.6712, category: "lake" },
  { place_id: "varthur_lake", name: "Varthur Lake", display_name: "Varthur Lake, Whitefield Valley, Bengaluru", lat: 12.9515, lon: 77.7289, category: "lake" },
  { place_id: "koramangala", name: "Koramangala Valley", display_name: "Koramangala 4th Block & Sony World, Bengaluru", lat: 12.9345, lon: 77.6266, category: "locality" },
  { place_id: "indiranagar", name: "Indiranagar", display_name: "Indiranagar 100ft Road, Bengaluru", lat: 12.9784, lon: 77.6408, category: "locality" },
  { place_id: "electronic_city", name: "Electronic City", display_name: "Electronic City Phase 1 & Infosys Campus, Bengaluru", lat: 12.8452, lon: 77.6602, category: "tech_corridor" },
  { place_id: "whitefield", name: "Whitefield (ITPB)", display_name: "Whitefield & International Tech Park, Bengaluru", lat: 12.9698, lon: 77.7499, category: "tech_corridor" },
  { place_id: "hebbal_lake", name: "Hebbal Lake & Flyover", display_name: "Hebbal Lake, Bellary Road, Bengaluru", lat: 13.0358, lon: 77.5970, category: "lake" },
  { place_id: "hsr_layout", name: "HSR Layout Sector 1-7", display_name: "HSR Layout & Agara Basin, Bengaluru", lat: 12.9121, lon: 77.6446, category: "locality" },
  { place_id: "mg_road", name: "MG Road & Vidhana Soudha", display_name: "Central Business District, Bengaluru", lat: 12.9756, lon: 77.6066, category: "landmark" },
  { place_id: "sankey_tank", name: "Sankey Tank", display_name: "Sankey Tank, Malleshwaram / Sadashivanagar, Bengaluru", lat: 13.0084, lon: 77.5746, category: "lake" },
  { place_id: "madivala_lake", name: "Madivala Lake", display_name: "Madivala Lake & BTM 2nd Stage, Bengaluru", lat: 12.9192, lon: 77.6186, category: "lake" },
  { place_id: "peenya", name: "Peenya Industrial Area", display_name: "Peenya Industrial Area, Tumkur Road, Bengaluru", lat: 13.0308, lon: 77.5257, category: "industrial" },
];

const SEARCH_CACHE = new Map<string, SearchResult[]>();

export const CitySearchBox: React.FC<CitySearchBoxProps> = ({ onSelectLocation, className = "" }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const executeSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults(CURATED_BENGALURU_PLACES);
      setLoading(false);
      return;
    }

    // 1. Filter local curated places first
    const localMatches = CURATED_BENGALURU_PLACES.filter(
      (p) =>
        p.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        p.display_name.toLowerCase().includes(trimmed.toLowerCase())
    );

    // 2. Check cache
    const cacheKey = trimmed.toLowerCase();
    if (SEARCH_CACHE.has(cacheKey)) {
      setResults(SEARCH_CACHE.get(cacheKey)!);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Bounded Nominatim OSM query for Bengaluru metropolitan bounding box
      // viewbox: [minLon, maxLat, maxLon, minLat] = [77.40, 13.25, 77.85, 12.75]
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        trimmed + " Bengaluru"
      )}&viewbox=77.40,13.25,77.85,12.75&bounded=1&limit=8`;

      const response = await fetch(url, {
        headers: {
          "Accept-Language": "en",
        },
      });

      if (!response.ok) throw new Error("Geocoder request failed");
      const data = await response.json();

      const osmResults: SearchResult[] = data.map((item: any) => ({
        place_id: item.place_id,
        name: item.name || item.display_name.split(",")[0],
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        category: item.class,
      }));

      // Merge unique results (curated on top)
      const combined = [...localMatches];
      osmResults.forEach((r) => {
        if (!combined.some((c) => Math.abs(c.lat - r.lat) < 0.005 && Math.abs(c.lon - r.lon) < 0.005)) {
          combined.push(r);
        }
      });

      SEARCH_CACHE.set(cacheKey, combined);
      setResults(combined);
    } catch (e) {
      console.warn("Geocoding lookup error, falling back to local registry:", e);
      setResults(localMatches.length > 0 ? localMatches : CURATED_BENGALURU_PLACES);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      executeSearch(val);
    }, 350);
  };

  const handleFocus = () => {
    setIsOpen(true);
    if (results.length === 0) {
      setResults(CURATED_BENGALURU_PLACES);
    }
  };

  const handleSelect = (item: SearchResult) => {
    setQuery(item.name);
    setIsOpen(false);
    onSelectLocation(item.lat, item.lon, item.name);
  };

  return (
    <div ref={containerRef} className={`city-search-container ${className}`}>
      <div className="city-search-input-wrap">
        <span className="city-search-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          className="city-search-input"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Search Bengaluru locality, road, lake..."
          aria-label="Search Bengaluru localities and landmarks"
          autoComplete="off"
          spellCheck="false"
        />
        {loading && <span className="city-search-spinner" aria-label="Searching..." />}
        {query && !loading && (
          <button
            type="button"
            className="city-search-clear"
            onClick={() => {
              setQuery("");
              setResults(CURATED_BENGALURU_PLACES);
            }}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <ul className="city-search-dropdown" role="listbox">
          <li className="city-search-header">
            <span>BENGALURU GIS DIRECTORY</span>
            <span className="city-search-count">{results.length} PLACES</span>
          </li>
          {results.length === 0 && !loading && (
            <li className="city-search-empty">No matching localities within Bengaluru domain</li>
          )}
          {results.map((item) => (
            <li
              key={item.place_id}
              className="city-search-item"
              role="option"
              aria-selected={false}
              onClick={() => handleSelect(item)}
            >
              <div className="city-search-item-primary">
                <span className="city-search-pin-icon" aria-hidden="true">
                  {item.category === "lake" ? "💧" : item.category === "tech_corridor" ? "🏢" : "📍"}
                </span>
                <span className="city-search-item-name">{item.name}</span>
                {item.category && (
                  <span className="city-search-category-badge">{item.category.replace("_", " ")}</span>
                )}
              </div>
              <div className="city-search-item-coords">
                {item.lat.toFixed(4)}° N, {item.lon.toFixed(4)}° E
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
