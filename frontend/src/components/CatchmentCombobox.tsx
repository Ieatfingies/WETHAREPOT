import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type { RegionInfo } from "../types/simulation";
import {
  CompassRoseIcon,
  SearchIcon,
  CloseIcon,
  ChevronDownIcon,
  CheckIcon,
} from "./icons/CartographicIcons";

interface CatchmentComboboxProps {
  regions: RegionInfo[];
  selectedRegionId: string;
  onSelectRegion: (id: string) => void;
  disabled?: boolean;
}

function formatCoords(coords: [number, number]): string {
  const [lat, lon] = coords;
  return `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
}

export function CatchmentCombobox({
  regions,
  selectedRegionId,
  onSelectRegion,
  disabled = false,
}: CatchmentComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 320,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const labelId = `${baseId}-label`;

  const selectedRegion = regions.find((r) => r.id === selectedRegionId) || regions[0];

  const filteredRegions = regions.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      r.id.toLowerCase().includes(q)
    );
  });

  const safeHighlightedIndex = Math.min(
    highlightedIndex,
    Math.max(0, filteredRegions.length - 1)
  );

  const updatePopoverPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  const closeCombobox = () => {
    setIsOpen(false);
    setQuery("");
  };

  // Click outside to close (supporting portal outside container)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        closeCombobox();
      }
    };

    const handleScrollOrResize = () => {
      updatePopoverPosition();
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      updatePopoverPosition();
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Scroll active option into view
  useEffect(() => {
    if (!isOpen || !listboxRef.current) return;
    const activeEl = listboxRef.current.querySelector<HTMLLIElement>(".combobox-option.is-highlighted");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [safeHighlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredRegions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, filteredRegions.length - 1)
        );
        break;
      case "Enter":
        e.preventDefault();
        if (filteredRegions[safeHighlightedIndex]) {
          onSelectRegion(filteredRegions[safeHighlightedIndex].id);
          closeCombobox();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeCombobox();
        break;
      case "Home":
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightedIndex(Math.max(0, filteredRegions.length - 1));
        break;
    }
  };

  return (
    <div className="combobox-wrapper" onKeyDown={handleKeyDown}>
      <label id={labelId} className="field-label" htmlFor={`${baseId}-trigger`}>
        CATCHMENT STUDY BASIN
        <span className="field-sublabel">{regions.length} BASINS AVAILABLE</span>
      </label>

      {/* Combobox Trigger */}
      <button
        ref={triggerRef}
        id={`${baseId}-trigger`}
        type="button"
        className={`combobox-trigger ${isOpen ? "is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${baseId}-trigger`}
        disabled={disabled || regions.length === 0}
        onClick={() => {
          if (!isOpen) updatePopoverPosition();
          setIsOpen((prev) => !prev);
        }}
      >
        <span className="combobox-trigger-icon" aria-hidden="true">
          <CompassRoseIcon width={18} height={18} />
        </span>
        <div className="combobox-trigger-content">
          <span className="combobox-trigger-title">
            {selectedRegion ? selectedRegion.name : "Select catchment…"}
          </span>
          {selectedRegion && (
            <span className="combobox-trigger-coords">
              {formatCoords(selectedRegion.center)}
            </span>
          )}
        </div>
        <span className="combobox-chevron" aria-hidden="true">
          <ChevronDownIcon width={16} height={16} />
        </span>
      </button>

      {/* Selected Catchment Brief Note */}
      {selectedRegion?.description && (
        <p className="catchment-description-note">
          {selectedRegion.description}
        </p>
      )}

      {/* Dropdown Popover Rendered via Portal to eliminate clipping */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="combobox-popover portaled-popover"
            style={{
              position: "fixed",
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              width: `${popoverPos.width}px`,
              zIndex: 99999,
            }}
            role="dialog"
            aria-modal="false"
          >
            <div className="combobox-search-bar">
              <span className="combobox-search-icon" aria-hidden="true">
                <SearchIcon width={15} height={15} />
              </span>
              <input
                ref={inputRef}
                type="text"
                className="combobox-search-input"
                placeholder="Search catchments by name or valley…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={
                  filteredRegions[safeHighlightedIndex]
                    ? `${baseId}-opt-${filteredRegions[safeHighlightedIndex].id}`
                    : undefined
                }
              />
              {query && (
                <button
                  type="button"
                  className="combobox-clear-btn"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear catchment search"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              )}
            </div>

            <div className="combobox-meta-bar">
              <span>{filteredRegions.length} CATCHMENTS</span>
              <span>BENGALURU BASIN</span>
            </div>

            <ul
              id={listboxId}
              ref={listboxRef}
              className="combobox-listbox"
              role="listbox"
              aria-labelledby={labelId}
            >
              {filteredRegions.length === 0 ? (
                <li className="combobox-empty">
                  No catchments matching &ldquo;{query}&rdquo;
                </li>
              ) : (
                filteredRegions.map((region, idx) => {
                  const isSelected = region.id === selectedRegionId;
                  const isHighlighted = idx === safeHighlightedIndex;

                  return (
                    <li
                      key={region.id}
                      id={`${baseId}-opt-${region.id}`}
                      role="option"
                      aria-selected={isSelected}
                      className={`combobox-option ${isSelected ? "is-selected" : ""} ${
                        isHighlighted ? "is-highlighted" : ""
                      }`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => {
                        onSelectRegion(region.id);
                        closeCombobox();
                      }}
                    >
                      <div className="option-marker">
                        <span className="option-index">{(idx + 1).toString().padStart(2, "0")}</span>
                      </div>
                      <div className="option-body">
                        <div className="option-title-row">
                          <strong className="option-name">{region.name}</strong>
                          {isSelected && (
                            <span className="option-check" aria-hidden="true">
                              <CheckIcon width={14} height={14} />
                            </span>
                          )}
                        </div>
                        {region.description && (
                          <p className="option-description">{region.description}</p>
                        )}
                        <div className="option-coords">
                          <span>LAT/LON</span>
                          <code className="tabular-num">{formatCoords(region.center)}</code>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
