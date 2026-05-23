
import { FlowLink } from '@/components/ui/flow-link';

const DEFAULT_LOGO_URL = 'https://neupcdn.com/neupaccount/assets/logo.svg';


type NeupIdLogoProps = {
  iconHref: string;
  textHref: string;
  logoUrl?: string;
};

export function NeupIdLogo({ iconHref, textHref, logoUrl }: NeupIdLogoProps) {
  return (
    <div className="flex items-center gap-2">
      <a href={iconHref} target="_blank" rel="noopener noreferrer">
        <span className="sr-only">Company Homepage</span>
        <img
          src={logoUrl || DEFAULT_LOGO_URL}
          alt="Neup Group Logo"
          width={28}
          height={28}
          className="h-7 w-7"
          loading="eager"
        />
      </a>
      <FlowLink href={textHref}>
        <span className="text-lg font-semibold tracking-tight font-headline">
          Neup.Account
        </span>
      </FlowLink>
    </div>
  );
}
