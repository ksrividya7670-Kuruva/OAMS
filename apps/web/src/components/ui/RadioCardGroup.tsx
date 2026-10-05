import React, { useRef, useId } from 'react';

export interface RadioCardOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioCardGroupProps<T extends string = string> {
  label: string;
  options: RadioCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function RadioCardGroup<T extends string = string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: RadioCardGroupProps<T>) {
  const labelId = useId();
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleKeyDown = (event: React.KeyboardEvent, currentIndex: number) => {
    let targetIndex = -1;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        targetIndex = (currentIndex + 1) % options.length;
        while (options[targetIndex]?.disabled && targetIndex !== currentIndex) {
          targetIndex = (targetIndex + 1) % options.length;
        }
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        targetIndex = (currentIndex - 1 + options.length) % options.length;
        while (options[targetIndex]?.disabled && targetIndex !== currentIndex) {
          targetIndex = (targetIndex - 1 + options.length) % options.length;
        }
        break;

      case 'Home':
        event.preventDefault();
        targetIndex = 0;
        while (options[targetIndex]?.disabled && targetIndex < options.length - 1) {
          targetIndex++;
        }
        break;

      case 'End':
        event.preventDefault();
        targetIndex = options.length - 1;
        while (options[targetIndex]?.disabled && targetIndex > 0) {
          targetIndex--;
        }
        break;

      case ' ':
      case 'Enter':
        event.preventDefault();
        if (!options[currentIndex]?.disabled) {
          onChange(options[currentIndex].value);
        }
        return;

      default:
        return;
    }

    if (targetIndex >= 0 && targetIndex < options.length && !options[targetIndex]?.disabled) {
      onChange(options[targetIndex].value);
      cardRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span id={labelId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isDisabled = !!option.disabled;

          return (
            <div
              key={option.value}
              ref={(el) => {
                cardRefs.current[index] = el;
              }}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onClick={() => {
                if (!isDisabled) {
                  onChange(option.value);
                  cardRefs.current[index]?.focus();
                }
              }}
              className={`relative flex flex-col p-4 rounded-lg border-2 text-left transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                isDisabled
                  ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                  : isSelected
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {option.label}
                </span>
                {option.badge}
              </div>
              {option.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{option.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
