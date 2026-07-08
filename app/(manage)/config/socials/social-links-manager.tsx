"use client";

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/core/hooks/use-toast';
import { addSocialLink, deleteSocialLink, toggleSocialLinkVisibility } from "@/services/manage/site/socials";
import type { SocialLink } from '@/services/manage/site/socials';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Instagram, Linkedin, Twitter, Facebook, Bot, Link, Trash2, Loader2, Plus, Eye, EyeOff } from 'lucide-react';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger} from "@/components/ui/alert-dialog";

const formSchema = z.object({
    type: z.enum(['instagram', 'linkedin', 'twitter', 'facebook', 'whatsapp', 'other']),
    url: z.string().url("Please enter a valid URL."),
});

type FormValues = z.infer<typeof formSchema>;

const socialIcons = {
    instagram: Instagram,
    linkedin: Linkedin,
    twitter: Twitter,
    facebook: Facebook,
    whatsapp: Bot,
    other: Link,
};

export function SocialLinksManager({ initialLinks }: { initialLinks: SocialLink[] }) {
    const [links, setLinks] = useState<SocialLink[]>(initialLinks);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { type: 'other', url: '' },
    });

    const onSubmit = (data: FormValues) => {
        const formData = new FormData();
        formData.append('type', data.type);
        formData.append('url', data.url);

        startTransition(async () => {
            const result = await addSocialLink(formData);
            if (result.success && result.newLink) {
                setLinks(prev => [...prev, result.newLink!]);
                form.reset();
                toast({ title: 'Success', description: 'Social link added.', className: 'bg-accent text-accent-foreground' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };
    
    const handleToggle = (id: string, currentVisibility: boolean) => {
        startTransition(async () => {
            const result = await toggleSocialLinkVisibility(id, !currentVisibility);
            if(result.success) {
                setLinks(prev => prev.map(link => link.id === id ? { ...link, isVisible: !currentVisibility } : link));
                toast({ title: `Link ${!currentVisibility ? 'shown' : 'hidden'}.` });
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    }

    const handleDelete = (id: string) => {
        startTransition(async () => {
            const result = await deleteSocialLink(id);
            if (result.success) {
                setLinks(prev => prev.filter(link => link.id !== id));
                toast({ title: 'Link deleted.' });
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    }

    return (
        <div className="grid gap-8">
            <Card>
                <CardHeader>
                    <CardTitle>Manage Social Links</CardTitle>
                    <CardDescription>Add, remove, or toggle the visibility of your social media profiles.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     {links.length > 0 ? (
                         <div className="border rounded-lg">
                            {links.map(link => {
                                const Icon = socialIcons[link.type];
                                return (
                                    <div key={link.id} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                                        <Icon className="h-6 w-6 text-muted-foreground" />
                                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-grow text-sm truncate hover:underline">{link.url}</a>
                                        <div className="flex items-center gap-4">
                                             <Button onClick={() => handleToggle(link.id, link.isVisible)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled={isPending}>
                                                {link.isVisible ? <Eye /> : <EyeOff />}
                                            </Button>
                                             <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isPending}>
                                                        <Trash2 />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will permanently delete this social link. This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(link.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                )
                            })}
                         </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No social links have been added yet.</p>
                    )}
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Add New Link</CardTitle>
                </CardHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardContent className="flex flex-col md:flex-row gap-4">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem className="w-full md:w-1/4">
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="instagram">Instagram</SelectItem>
                                                <SelectItem value="linkedin">LinkedIn</SelectItem>
                                                <SelectItem value="twitter">Twitter / X</SelectItem>
                                                <SelectItem value="facebook">Facebook</SelectItem>
                                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                                <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="url"
                                render={({ field }) => (
                                    <FormItem className="flex-grow">
                                        <FormControl>
                                            <Input placeholder="https://..." {...field} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2" />}
                                Add Link
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>

        </div>
    );
}