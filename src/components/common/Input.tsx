import { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  suffix?: string
  prefix?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, suffix, prefix, id, className = '', ...props }, ref) => {
    const inputId = id || `input-${label.replace(/\s+/g, '-').toLowerCase()}`

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>

        <div className={`
          flex items-center bg-white border rounded-lg transition-all duration-150
          ${error
            ? 'border-red-500 focus-within:ring-2 focus-within:ring-red-500/20'
            : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20'
          }
        `}>
          {prefix && (
            <span className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-r border-gray-200 rounded-l-lg">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              flex-1 px-3 py-2 bg-transparent text-gray-900 text-sm min-w-0
              focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed
              placeholder:text-gray-400
              ${props.type === 'number' ? 'font-mono tabular-nums' : ''}
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            `}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {suffix && (
            <span className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-l border-gray-200 rounded-r-lg whitespace-nowrap">
              {suffix}
            </span>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-500 mt-0.5" role="alert">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-gray-500 mt-0.5">
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
