'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * SearchableSelect Component
 * Enhanced dropdown with instant search/filter, keyboard navigation, and mobile-friendly touch targets.
 *
 * @param {Object} props
 * @param {Array} props.options - Array of items, e.g. [{ id, code, name, value, label, sublabel }]
 * @param {string|number} props.value - Currently selected value (matches opt.id or opt.value)
 * @param {Function} props.onChange - (selectedValue, selectedOption) => void
 * @param {string} [props.placeholder='-- Select Model --']
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.required=false]
 * @param {string} [props.className='']
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = '-- Select Model --',
  disabled = false,
  required = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options to a standard shape: { value, label, sublabel, code }
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      const val = opt.value !== undefined ? opt.value : opt.id;
      const code = opt.code || '';
      const name = opt.name || opt.label || '';
      const label = code && name && code !== name ? `${code} - ${name}` : name || code || String(val);
      const sublabel = opt.sublabel || (code && name && code !== name ? name : '');
      return {
        ...opt,
        value: val,
        code,
        label,
        sublabel,
      };
    });
  }, [options]);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => String(opt.value) === String(value)) || null;
  }, [normalizedOptions, value]);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.code.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchTerm]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setHighlightedIndex(0);
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelect = (option) => {
    if (onChange) {
      onChange(option.value, option);
    }
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden input for HTML form validation */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          value={value || ''}
          onChange={() => {}}
          required={required}
          className="sr-only"
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between px-3 py-2 text-left bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
          disabled
            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            : isOpen
            ? 'border-primary-500 ring-2 ring-primary-500/20'
            : 'border-gray-300 hover:border-gray-400 text-gray-900'
        }`}
      >
        <span className="truncate text-xs font-semibold">
          {selectedOption ? (
            <span className="flex items-center space-x-1.5">
              {selectedOption.code && (
                <span className="font-mono text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded text-[11px] border border-primary-200">
                  {selectedOption.code}
                </span>
              )}
              <span className="truncate">{selectedOption.name || selectedOption.label}</span>
            </span>
          ) : (
            <span className="text-gray-400 font-normal">{placeholder}</span>
          )}
        </span>

        <span className="ml-2 flex-shrink-0 text-gray-400">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-scaleUp">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/80">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400 text-xs">
                🔍
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Type to filter models..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto divide-y divide-gray-50 py-1 text-xs"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-primary-50 text-primary-900 font-bold'
                        : isHighlighted
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        {opt.code && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200">
                            {opt.code}
                          </span>
                        )}
                        <span className="truncate">{opt.name || opt.label}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="text-primary-600 font-bold text-xs ml-2">✓</span>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-gray-400 text-xs italic">
                No cooler models matching "{searchTerm}"
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
