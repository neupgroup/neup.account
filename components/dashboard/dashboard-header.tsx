import { getUserProfile } from '@/services/user';
import { VerifiedBadge } from '../verified-badge';
import { LetterDisplayImage } from '@/components/elements/letterDisplayImage';
import { DashboardSearchInput } from './dashboard-search-input';

/** Chooses a greeting for the current server request time. */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Renders homepage profile details and the profile image on the server. */
export async function DashboardHeader({ accountId }: { accountId: string }) {
  const profile = await getUserProfile(accountId);
  if (!profile) return null;

  const greetingName = profile.nameDisplay || profile.nameFirst || 'User';
  const photoUrl = profile.accountPhoto?.includes('/_plain_') ? null : profile.accountPhoto;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <LetterDisplayImage
          src={photoUrl}
          displayName={greetingName}
          alt={greetingName}
          className="h-16 w-16 rounded-lg"
          fontSize="1.5rem"
        />
        <div>
          <p className="text-muted-foreground">{getGreeting()}</p>
          <div className="flex items-center gap-2">
            <h1 className="font-bold tracking-tight text-2xl leading-8">{greetingName}!</h1>
            <VerifiedBadge accountId={accountId} className="h-6 w-6" />
          </div>
        </div>
      </div>
      <DashboardSearchInput />
    </div>
  );
}
