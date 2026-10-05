import { type FC, useState } from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
  textColor?: string;
}

export interface DonutChartProps {
  title: string;
  subtitle?: string;
  segments: DonutSegment[];
  totalLabel?: string;
  size?: number;
}

export const DonutChart: FC<DonutChartProps> = ({
  title,
  subtitle,
  segments,
  totalLabel = 'Total',
  size = 180,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-2xs">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </h3>
          <span className="text-[10px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
            {total} items
          </span>
        </div>
        {subtitle && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="my-4 flex items-center justify-center relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-[var(--bg-subtle)] opacity-40"
          />

          {total === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#94A3B8"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={0}
              opacity={0.3}
            />
          ) : (
            segments.map((seg, idx) => {
              if (seg.value <= 0) return null;
              const percent = seg.value / total;
              const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
              const strokeDashoffset = -circumference * accumulatedPercent;
              accumulatedPercent += percent;

              const isHovered = hoveredIdx === idx;

              return (
                <circle
                  key={seg.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl font-bold font-serif text-[var(--text-main)]">
            {hoveredIdx !== null && segments[hoveredIdx]
              ? segments[hoveredIdx].value
              : total}
          </span>
          <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
            {hoveredIdx !== null && segments[hoveredIdx]
              ? segments[hoveredIdx].label
              : totalLabel}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)]">
        {segments.map((seg, idx) => {
          const percent = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div
              key={seg.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between text-[11px] p-1.5 rounded-lg transition-colors cursor-pointer ${
                hoveredIdx === idx ? 'bg-[var(--bg-subtle)]' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="truncate text-[var(--text-main)] font-medium">
                  {seg.label}
                </span>
              </div>
              <span className="font-semibold text-[var(--text-muted)] shrink-0 ml-1">
                {seg.value} ({percent}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface BarDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  highlight?: boolean;
}

export interface BarChartProps {
  title: string;
  subtitle?: string;
  data: BarDataPoint[];
  color?: string;
  secondaryColor?: string;
  unit?: string;
  height?: number;
}

export const BarChart: FC<BarChartProps> = ({
  title,
  subtitle,
  data,
  color = '#2957D6',
  unit = 'requests',
  height = 140,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartHeight = height;

  return (
    <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-2xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="text-xs font-bold text-[var(--brand-primary)]">
            {data[hoveredIdx].label}: {data[hoveredIdx].value} {unit}
          </div>
        )}
      </div>

      <div className="mt-4 pt-2">
        <div
          className="flex items-end justify-between gap-2 border-b border-[var(--border-subtle)] pb-2"
          style={{ height: chartHeight }}
        >
          {data.map((item, idx) => {
            const barHeightPercent = Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 4);
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={item.label}
                className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Bar Value Tooltip */}
                <div
                  className={`text-[10px] font-bold mb-1 transition-opacity ${
                    isHovered ? 'opacity-100 text-[var(--text-main)]' : 'opacity-0 text-[var(--text-muted)]'
                  }`}
                >
                  {item.value}
                </div>

                {/* The Bar */}
                <div className="w-full max-w-[36px] bg-[var(--bg-subtle)] rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
                  <div
                    className="w-full rounded-t-lg transition-all duration-300"
                    style={{
                      height: `${barHeightPercent}%`,
                      backgroundColor: item.highlight ? '#1A3170' : color,
                      opacity: isHovered ? 1 : 0.85,
                      transform: isHovered ? 'scaleY(1.03)' : 'scaleY(1)',
                      transformOrigin: 'bottom',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* X Axis Labels */}
        <div className="flex items-center justify-between gap-2 mt-2">
          {data.map((item, idx) => (
            <div
              key={item.label}
              className={`flex-1 text-center text-[10px] font-semibold truncate transition-colors ${
                hoveredIdx === idx
                  ? 'text-[var(--brand-primary)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export interface AreaTrendPoint {
  label: string;
  value: number;
}

export interface AreaTrendChartProps {
  title: string;
  subtitle?: string;
  data: AreaTrendPoint[];
  color?: string;
  height?: number;
}

export const AreaTrendChart: FC<AreaTrendChartProps> = ({
  title,
  subtitle,
  data,
  color = '#059669',
  height = 130,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const width = 360;
  const paddingY = 16;
  const usableHeight = height - paddingY * 2;

  // Build points for SVG path
  const points = data.map((d, idx) => {
    const x = (idx / Math.max(data.length - 1, 1)) * width;
    const y = height - paddingY - (d.value / maxValue) * usableHeight;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-2xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {data[hoveredIdx].label}: {data[hoveredIdx].value}
          </div>
        )}
      </div>

      <div className="mt-3 relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
          style={{ height }}
        >
          <defs>
            <linearGradient id={`areaGrad-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path
            d={areaD}
            fill={`url(#areaGrad-${title.replace(/\s+/g, '')})`}
          />

          {/* Line stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data point dots */}
          {points.map((pt, idx) => (
            <circle
              key={pt.label}
              cx={pt.x}
              cy={pt.y}
              r={hoveredIdx === idx ? 6 : 3.5}
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
              className="cursor-pointer transition-all duration-200"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* X Axis Labels */}
        <div className="flex items-center justify-between gap-1 mt-2 text-[10px] text-[var(--text-muted)] font-medium">
          {data.map((d, idx) => (
            <span
              key={d.label}
              className={`transition-colors ${
                hoveredIdx === idx ? 'text-[var(--text-main)] font-bold' : ''
              }`}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export interface ProgressGaugeProps {
  title: string;
  subtitle?: string;
  value: number; // percentage (0-100)
  metricLabel: string;
  statusText?: string;
  color?: string;
}

export const ProgressGauge: FC<ProgressGaugeProps> = ({
  title,
  subtitle,
  value,
  metricLabel,
  statusText,
  color = '#10B981',
}) => {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const size = 120;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-2xs">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="my-3 flex items-center justify-center gap-5">
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              className="text-[var(--bg-subtle)] opacity-40"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-bold font-serif text-[var(--text-main)]">
              {clampedValue}%
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-bold text-[var(--text-main)]">
            {metricLabel}
          </div>
          {statusText && (
            <span className="inline-block text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {statusText}
            </span>
          )}
          <p className="text-[10px] text-[var(--text-muted)]">
            Standard institutional benchmark: &gt;90%
          </p>
        </div>
      </div>
    </div>
  );
};
