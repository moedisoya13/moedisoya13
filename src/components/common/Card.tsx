import type { FC, ReactNode } from 'react'

export interface CardProps {
  title?: string
  colorTheme?: 'default' | 'bank1' | 'bank2' | 'bank3'
  children: ReactNode
  className?: string
  headerAction?: ReactNode
}

const themeClasses = {
  default: {
    header: 'bg-gray-50 border-gray-100',
    title: 'text-gray-800',
  },
  bank1: {
    header: 'bg-gradient-to-r from-emerald-50 to-emerald-50/50 border-emerald-100',
    title: 'text-emerald-600',
  },
  bank2: {
    header: 'bg-gradient-to-r from-amber-50 to-amber-50/50 border-amber-100',
    title: 'text-amber-600',
  },
  bank3: {
    header: 'bg-gradient-to-r from-violet-50 to-violet-50/50 border-violet-100',
    title: 'text-violet-600',
  },
}

export const Card: FC<CardProps> = ({
  title,
  colorTheme = 'default',
  children,
  className = '',
  headerAction,
}) => {
  const theme = themeClasses[colorTheme]

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      {title && (
        <div className={`flex items-center justify-between px-5 py-4 border-b ${theme.header}`}>
          <h3 className={`text-base font-semibold ${theme.title}`}>{title}</h3>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export default Card
