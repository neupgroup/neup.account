import type { ElementType, ReactNode } from 'react';
import { FlowLink } from '@/components/flow-link';
import {
  AlertTriangle,
  AtSign,
  AppWindow,
  BarChart,
  Bell,
  Building,
  ChevronRight,
  Contact,
  CreditCard,
  FileLock2,
  FileText,
  Gem,
  Globe,
  Handshake,
  HeartHandshake,
  History,
  KeyRound,
  Laptop,
  List,
  Mail,
  MailQuestion,
  MessageSquareWarning,
  PowerOff,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCircle,
  UserPlus,
  UserX,
  Users,
  Wallet,
} from '@/components/icons';

const iconMap: Record<string, ElementType> = {
  KeyRound, ShieldCheck, FileLock2, Users, Smartphone, Mail, Laptop, Globe,
  UserCircle, FileText, HeartHandshake, AtSign, Contact, Building, UserPlus,
  History, Trash2, PowerOff, AppWindow, Share2, BarChart, MailQuestion, UserX,
  CreditCard, Wallet, Gem, List, AlertTriangle, Bell, Handshake,
  MessageSquareWarning,
};

type ListItemProps = {
  icon?: ElementType;
  iconName?: string;
  title: string;
  description: ReactNode;
  href: string;
  isExternal?: boolean;
};

export function ListItem({ icon: Icon, iconName, title, description, href, isExternal = false }: ListItemProps) {
  const IconComponent = Icon ?? (iconName ? iconMap[iconName] : undefined);
  const content = <div className="flex items-center gap-4 px-4 py-4">
    {IconComponent && <IconComponent className="h-5 w-5 shrink-0 text-muted-foreground" />}
    <div className="grow"><p className="font-medium text-foreground">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div>
    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
  </div>;

  if (isExternal) return <a href={href} target="_blank" rel="noopener noreferrer" className="block transition-colors hover:bg-muted/50">{content}</a>;
  return <FlowLink href={href} className="block transition-colors hover:bg-muted/50">{content}</FlowLink>;
}
