// Shared form-control classes, kept free of tailwind-merge so light client islands (public
// pages, auth forms) can use them.
export const fieldControlClasses =
  'w-full min-w-0 rounded-md border border-input bg-card text-body text-foreground shadow-xs transition-colors duration-fast placeholder:text-muted-foreground focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger';
