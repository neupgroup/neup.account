import { LetterImage, type LetterImageProps } from '@neup/components/ui/letterImage';

export type LetterDisplayImageProps = Omit<LetterImageProps, 'initials'> & {
  displayName?: string | null;
  initials?: string;
};

/** Displays an account photo or a server-rendered initial fallback. */
export function LetterDisplayImage({ displayName, initials, ...props }: LetterDisplayImageProps) {
  const resolvedInitials = initials ?? (displayName?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || 'U');
  return <LetterImage {...props} initials={resolvedInitials} alt={props.alt ?? displayName ?? ''} />;
}
