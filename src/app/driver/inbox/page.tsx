import { DriverInbox } from '@/features/driver/DriverInbox';
import { readDriverLang } from '@/features/driver/read-lang';

export const metadata = { title: 'Inbox' };

export default async function DriverInboxPage() {
  return <DriverInbox lang={await readDriverLang()} />;
}
