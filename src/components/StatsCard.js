'use client';

export default function StatsCard({
  title,
  value,
  icon,
  color = 'blue',
  subtitle,
  onClick,
}) {
  const colorStyles = {
    blue: {
      border: 'border-l-blue-500',
      iconBg: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
      badgeBg: 'bg-blue-50 text-blue-700',
      valueColor: 'text-gray-900',
    },
    green: {
      border: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
      badgeBg: 'bg-emerald-50 text-emerald-700',
      valueColor: 'text-gray-900',
    },
    yellow: {
      border: 'border-l-amber-500',
      iconBg: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
      badgeBg: 'bg-amber-50 text-amber-700',
      valueColor: 'text-gray-900',
    },
    red: {
      border: 'border-l-rose-500',
      iconBg: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      badgeBg: 'bg-rose-50 text-rose-700',
      valueColor: 'text-gray-900',
    },
    indigo: {
      border: 'border-l-indigo-500',
      iconBg: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100',
      badgeBg: 'bg-indigo-50 text-indigo-700',
      valueColor: 'text-gray-900',
    },
    purple: {
      border: 'border-l-purple-500',
      iconBg: 'bg-purple-50 text-purple-600 ring-1 ring-purple-100',
      badgeBg: 'bg-purple-50 text-purple-700',
      valueColor: 'text-gray-900',
    },
  };

  const style = colorStyles[color] || colorStyles.blue;
  const displayValue =
    typeof value === 'number'
      ? value.toLocaleString()
      : value !== null && value !== undefined
      ? value
      : '0';

  return (
    <div
      onClick={onClick}
      className={`card border-l-4 ${style.border} transition-all duration-200 hover:shadow-md ${
        onClick ? 'cursor-pointer hover:border-gray-300' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 truncate">
            {title}
          </p>
          <div className="mt-2 flex items-baseline">
            <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${style.valueColor}`}>
              {displayValue}
            </span>
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-500 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div
            className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl text-xl sm:text-2xl ${style.iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
