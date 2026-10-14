import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

const variants: Record<Variant, string> = {
  primary: 'bg-clay-700 text-white hover:bg-clay-500',
  secondary: 'border border-line bg-surface text-ink hover:bg-clay-50',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-5 font-medium transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
