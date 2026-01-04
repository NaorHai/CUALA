import React, { ReactNode, useId } from 'react'
import { cn } from '@/lib/utils'

export interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
  description?: string
  htmlFor?: string
}

export const FormField = ({
  label,
  error,
  required = false,
  children,
  className,
  description,
  htmlFor,
}: FormFieldProps) => {
  const id = useId()
  const fieldId = htmlFor || id

  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={fieldId}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && (
          <span className="text-destructive ml-1" aria-label="required">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={`${fieldId}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {React.isValidElement(children)
        ? React.cloneElement(children, {
            id: fieldId,
            'aria-describedby': description ? `${fieldId}-description` : undefined,
            'aria-invalid': error ? 'true' : undefined,
            'aria-required': required ? 'true' : undefined,
          } as React.HTMLAttributes<HTMLElement>)
        : children}
      {error && (
        <p
          id={`${fieldId}-error`}
          className="text-sm font-medium text-destructive"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  )
}

