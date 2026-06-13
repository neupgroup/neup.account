

"use client"

import { useEffect, useState, useTransition, useRef } from 'react'
import { notFound } from 'next/navigation'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Image from 'next/image'

import { updateUserProfile, getDisplayNameSuggestions, getPastProfilePhotos, getPublicDisplayImages, type PublicDisplayImage } from "@/services/profile"
import { useToast } from "@/core/hooks/use-toast"
import { uploadFile } from '@/services/upload'

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useSession } from '@/core/providers/session'
import { BackButton } from '@/components/ui/back-button'
import { cn } from '@/core/helpers/utils'
import { Check, Loader2, UploadCloud } from '@/components/icons'
import { SecondaryHeader } from '@/components/ui/secondary-header'
import { Separator } from '@/components/ui/separator'
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/core/auth/profile-permissions'

const photoFormSchema = z.object({
  accountPhoto: z.string().url("Please enter a valid URL.").optional().or(z.literal('')),
});

const nameFormSchema = z.object({
  selectedDisplayName: z.string().min(1, "Please select a display name format."),
  customDisplayName: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.selectedDisplayName === 'custom' && (!data.customDisplayName || data.customDisplayName.length < 3)) {
        ctx.addIssue({
            code: "custom",
            path: ["customDisplayName"],
            message: "Custom display name must be at least 3 characters.",
        });
    }
});

type PhotoFormValues = z.infer<typeof photoFormSchema>;
type NameFormValues = z.infer<typeof nameFormSchema>;

export default function DisplayInfoPage() {
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const { profile, accountId, permissions, loading: sessionLoading, refetch: refetchSession } = useSession();
    const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
    const [pastPhotos, setPastPhotos] = useState<string[]>([]);
    const [isPhotoPending, startPhotoTransition] = useTransition();
    const [isNamePending, startNameTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [photoView, setPhotoView] = useState<'uploader' | 'carousel' | 'public'>('uploader');
    const [publicPhotos, setPublicPhotos] = useState<PublicDisplayImage[]>([]);

    if (!sessionLoading && !hasAnyPermission(permissions, PROFILE_SECTION_PERMISSIONS.display)) {
        notFound();
    }

    const photoForm = useForm<PhotoFormValues>({
        resolver: zodResolver(photoFormSchema),
        defaultValues: { accountPhoto: "" }
    });

    const nameForm = useForm<NameFormValues>({
        resolver: zodResolver(nameFormSchema),
        defaultValues: { selectedDisplayName: "", customDisplayName: "" }
    });
    
    const { formState: photoFormState } = photoForm;

    useEffect(() => {
        if (profile && accountId) {
            const fetchSuggestions = async () => {
                if (accountId) {
                    const [suggestions, photos] = await Promise.all([
                        getDisplayNameSuggestions(accountId),
                        getPastProfilePhotos(accountId),
                    ]);
                    setNameSuggestions(suggestions);
                    setPastPhotos(photos);
                    const publicResources = await getPublicDisplayImages(accountId);
                    setPublicPhotos(publicResources);

                    const currentName = profile.nameDisplay || '';
                     if (suggestions.map(s => s.toLowerCase()).includes(currentName.toLowerCase())) {
                        nameForm.reset({
                            selectedDisplayName: suggestions.find(s => s.toLowerCase() === currentName.toLowerCase()) || currentName,
                            customDisplayName: "",
                        });
                    } else {
                         nameForm.reset({
                            selectedDisplayName: 'custom',
                            customDisplayName: currentName,
                        });
                    }
                    photoForm.reset({
                        accountPhoto: profile.accountPhoto || "",
                    });
                }
                setLoading(false);
            }
            fetchSuggestions();
        }
    }, [profile, accountId, nameForm, photoForm]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !accountId) return;

        startPhotoTransition(async () => {
            const contentId = `profile-photo-${accountId}-${Date.now()}`;
            const result = await uploadFile(file, "neup.account", contentId, file.name, accountId);
            if(result.success && result.url) {
                const updateResult = await updateUserProfile(accountId, { accountPhoto: result.url });
                if(updateResult.success) {
                    toast({ title: "Success", description: "Profile photo updated.", className: "bg-accent text-accent-foreground" });
                    photoForm.setValue('accountPhoto', result.url, { shouldDirty: true });
                    setPastPhotos(prev => [result.url as string, ...prev].slice(0, 4));
                    refetchSession();
                } else {
                    toast({ variant: "destructive", title: "Error", description: updateResult.error });
                }
            } else {
                 toast({ variant: "destructive", title: "Upload Failed", description: result.error });
            }
        });
    };
    
    const onPhotoSubmit = (data: PhotoFormValues) => {
        if (!accountId) return;
        startPhotoTransition(async () => {
            const result = await updateUserProfile(accountId, { accountPhoto: data.accountPhoto });
            if (result.success) {
                toast({ title: "Success", description: "Profile photo updated.", className: "bg-accent text-accent-foreground" });
                photoForm.reset(data); // Resets the form's dirty state
                refetchSession();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };

    const onNameSubmit = (data: NameFormValues) => {
        if (!accountId || !profile) {
            toast({ variant: "destructive", title: "Error", description: "Not authenticated or profile missing." });
            return;
        }

        startNameTransition(async () => {
            let payload: Record<string, any> = {};
            let isApprovalNeeded = true;
            
            const sanitizedCustomName = data.customDisplayName?.trim().replace(/\s+/g, ' ') || '';

            if (data.selectedDisplayName === 'custom') {
                const lowerCustomName = sanitizedCustomName.toLowerCase();

                // 1. Check if it's a case-insensitive match for a standard format.
                const isStandardFormat = nameSuggestions.some(suggestion => suggestion.toLowerCase() === lowerCustomName);
                if (isStandardFormat) {
                    payload = { nameDisplay: sanitizedCustomName };
                    isApprovalNeeded = false;
                } else {
                    // 2. Check if it's an extension of the current custom display name.
                    const currentNameIsStandard = nameSuggestions.some(s => s.toLowerCase() === profile.nameDisplay?.toLowerCase());
                    if (!currentNameIsStandard && profile.nameDisplay) {
                        const nameParts = [profile.nameFirst, profile.nameMiddle, profile.nameLast].filter(Boolean).map(n => n!.toLowerCase());
                        const currentCustomLower = profile.nameDisplay.toLowerCase();
                        
                        const isExtension = nameParts.some(part => lowerCustomName === `${currentCustomLower} ${part}`);
                        if(isExtension) {
                             payload = { nameDisplay: sanitizedCustomName };
                             isApprovalNeeded = false;
                        }
                    }
                }
                
                // 3. If not auto-approved by above logic, send for review.
                if (isApprovalNeeded) {
                    payload = { customDisplayNameRequest: sanitizedCustomName };
                }

            } else {
                // A standard format was selected.
                payload = { nameDisplay: data.selectedDisplayName };
                isApprovalNeeded = false;
            }

            const result = await updateUserProfile(accountId, payload);

            if (result.success) {
                toast({ title: "Success", description: result.message, className: "bg-accent text-accent-foreground" });
                if(!isApprovalNeeded) {
                    nameForm.setValue('customDisplayName', '');
                }
                nameForm.reset(data); // Resets the form's dirty state
                refetchSession();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }
    
    const selectedDisplayName = nameForm.watch('selectedDisplayName');
    const currentDisplayPhoto = photoForm.watch('accountPhoto');
    const profileGender = (profile?.gender || '').toLowerCase();
    const filteredPublicPhotos = publicPhotos.filter((photo) => {
        if (profileGender === 'male') return photo.type === 'displayImage_publicMale';
        if (profileGender === 'female') return photo.type === 'displayImage_publicFemale';
        if (profileGender === 'custom') return true;
        return true;
    });

    if (loading) {
        return <Skeleton className="h-96 w-full" />
    }

    return (
        <div className="space-y-8">
            <BackButton href="/manage/profile" />

            <div className="space-y-2">
                <SecondaryHeader
                    title="Display Image"
                    description="Update your public profile photo."
                />
                <Form {...photoForm}>
                    <form onSubmit={photoForm.handleSubmit(onPhotoSubmit)}>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="grid md:grid-cols-[150px_1fr] items-start gap-6">
                                    <Avatar className="h-36 w-36 rounded-lg">
                                        <AvatarImage src={currentDisplayPhoto || undefined} alt="Current Display Photo" data-ai-hint="person" className="object-cover" />
                                        <AvatarFallback className="rounded-lg" />
                                    </Avatar>
                                    
                                    <div>
                                        {photoView === 'uploader' ? (
                                            <div 
                                                className="relative min-h-48 h-full flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg text-center"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                                        handleFileChange({ target: { files: e.dataTransfer.files } } as any);
                                                    }
                                                }}
                                            >
                                                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                                                <p className="text-sm text-muted-foreground">
                                                    Drag and drop or
                                                     <button type="button" className="text-primary underline ml-1" onClick={() => fileInputRef.current?.click()} disabled={isPhotoPending}>
                                                        select a file
                                                    </button>
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    or <button type="button" className="text-primary underline" onClick={() => setPhotoView('public')}>choose from default public images</button>
                                                </p>
                                                {pastPhotos.length > 0 && (
                                                    <p className="text-xs text-muted-foreground">or <button type="button" className="text-primary underline" onClick={() => setPhotoView('carousel')}>select from previous images</button></p>
                                                )}
                                                <Input 
                                                    type="file" 
                                                    ref={fileInputRef} 
                                                    className="hidden" 
                                                    accept="image/*"
                                                    onChange={handleFileChange}
                                                />
                                            </div>
                                        ) : photoView === 'carousel' ? (
                                             <div className="relative min-h-48 h-full flex flex-col justify-between border-2 border-dashed rounded-lg p-4">
                                                <div className="flex flex-wrap items-start gap-3 pb-4">
                                                    {pastPhotos.map((photo, index) => (
                                                        <button
                                                            type="button"
                                                            key={index}
                                                            className="relative p-1 aspect-square w-24 h-24 flex-shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                            onClick={() => photoForm.setValue('accountPhoto', photo, { shouldDirty: true })}
                                                        >
                                                            <Image src={photo} alt={`Past Photo ${index + 1}`} fill objectFit="cover" className="rounded-md" />
                                                            {currentDisplayPhoto === photo && (
                                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                                                                    <Check className="h-8 w-8 text-white" />
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                                 <button type="button" className="text-primary underline text-sm p-0 h-auto" onClick={() => setPhotoView('uploader')}>
                                                    Upload new photo
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="relative min-h-48 h-full flex flex-col justify-between border-2 border-dashed rounded-lg p-4">
                                                <div className="flex items-center gap-3 overflow-x-auto pb-4">
                                                    {filteredPublicPhotos.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground">
                                                            No default public images available for your gender yet.
                                                        </p>
                                                    ) : (
                                                        filteredPublicPhotos.map((photo) => (
                                                            <button
                                                                type="button"
                                                                key={photo.id}
                                                                className="relative p-1 h-24 w-24 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                                onClick={() => photoForm.setValue('accountPhoto', photo.value, { shouldDirty: true })}
                                                                title={photo.title || undefined}
                                                            >
                                                                <Image src={photo.value} alt={photo.title || 'Public display image'} fill objectFit="cover" className="rounded-md" />
                                                                {currentDisplayPhoto === photo.value && (
                                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                                                                        <Check className="h-8 w-8 text-white" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                                <button type="button" className="text-primary underline text-sm p-0 h-auto" onClick={() => setPhotoView('uploader')}>
                                                    Upload new photo
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                             <CardFooter className="border-t pt-4 mt-4 flex justify-start">
                                 <Button type="submit" disabled={isPhotoPending || !photoFormState.isDirty}>
                                    {isPhotoPending ? <Loader2 className="animate-spin" /> : "Save"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </Form>
            </div>

            <div className="space-y-2">
                 <SecondaryHeader
                    title="Display Name"
                    description="Choose how your name appears on your profile."
                />
                <Form {...nameForm}>
                    <form onSubmit={nameForm.handleSubmit(onNameSubmit)}>
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div>
                                    <h3 className="text-2xl font-semibold tracking-tight">{profile?.nameDisplay}</h3>
                                </div>
                                <Separator />
                                <FormField
                                    control={nameForm.control}
                                    name="selectedDisplayName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Display Name Format</FormLabel>
                                            <FormControl>
                                                <div className="flex flex-wrap gap-2">
                                                    {nameSuggestions.map(name => (
                                                        <Button key={name} type="button" variant={field.value === name ? "default" : "secondary"} onClick={() => field.onChange(name)} className="relative">
                                                            {field.value === name && <Check className="absolute -left-1 -top-1 h-4 w-4 bg-primary text-primary-foreground rounded-full p-0.5" />}
                                                            {name}
                                                        </Button>
                                                    ))}
                                                    <Button type="button" variant={field.value === 'custom' ? "default" : "secondary"} onClick={() => field.onChange('custom')} className="relative">
                                                        {field.value === 'custom' && <Check className="absolute -left-1 -top-1 h-4 w-4 bg-primary text-primary-foreground rounded-full p-0.5" />}
                                                        Custom...
                                                    </Button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {selectedDisplayName === 'custom' && (
                                    <FormField
                                        control={nameForm.control}
                                        name="customDisplayName"
                                        render={({ field }) => (
                                            <FormItem className="mt-4">
                                                <FormLabel>Custom Display Name</FormLabel>
                                                <FormControl><Input {...field} value={field.value ?? ''} placeholder="Enter your custom display name" /></FormControl>
                                                <FormDescription>Your request will be sent for review.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </CardContent>
                            <CardFooter className="border-t pt-4 mt-4 flex justify-start">
                                 <Button type="submit" disabled={isNamePending || !nameForm.formState.isDirty}>
                                    {isNamePending ? <Loader2 className="animate-spin" /> : "Save"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </Form>
            </div>
        </div>
    )
}
