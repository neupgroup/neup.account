

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
import { cn } from '@/core/utils'
import { Check, Loader2, UploadCloud } from '@/components/icons'
import { SecondaryHeader } from '@/components/ui/secondary-header'
import { Separator } from '@/components/ui/separator'
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/logica/account/profile-permissions'
import { permission } from '@/logica/permission';
import { useSelectedProfilePage } from '../use-selected-profile-page';

const pagePermissions = [
  permission('profile.display.view.self', 'for_individual', 'page'),
  permission('profile.display.update.self', 'for_individual', 'page'),
  permission('profile.display.view.managed', 'for_individual', 'page'),
  permission('profile.display.update.managed', 'for_individual', 'page'),
  permission('profile.display.view.root', 'for_individual', 'page'),
  permission('profile.display.update.root', 'for_individual', 'page'),
];

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
    const {
        profile: sessionProfile,
        accountId: sessionAccountId,
        permissions: sessionPermissions,
        loading: sessionLoading,
        refetch: refetchSession,
    } = useSession();
    const {
        selectedProfile,
        selectedProfileDenied,
        loadingSelectedProfile,
        targetAccountId,
        targetPermissions,
        targetProfile,
        profileBackHref,
        refreshSelectedProfile,
    } = useSelectedProfilePage({
        requiredPermissions: PROFILE_SECTION_PERMISSIONS.display,
        sessionAccountId,
        sessionPermissions,
        sessionProfile,
    });
    const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
    const [pastPhotos, setPastPhotos] = useState<string[]>([]);
    const [isPhotoPending, startPhotoTransition] = useTransition();
    const [isNamePending, startNameTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [photoView, setPhotoView] = useState<'uploader' | 'carousel' | 'public'>('uploader');
    const [showAllPublicPhotos, setShowAllPublicPhotos] = useState(false);
    const [publicPhotos, setPublicPhotos] = useState<PublicDisplayImage[]>([]);
    const isBrandAccount = targetProfile?.accountType === 'brand';
    const currentDisplayName = isBrandAccount
        ? (targetProfile?.displayName || targetProfile?.nameDisplay || '')
        : (targetProfile?.nameDisplay || targetProfile?.displayName || '');

    if (selectedProfileDenied) {
        notFound();
    }

    if (!sessionLoading && !loadingSelectedProfile && !hasAnyPermission(targetPermissions, PROFILE_SECTION_PERMISSIONS.display)) {
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
        if (targetProfile && targetAccountId) {
            const fetchSuggestions = async () => {
                if (targetAccountId) {
                    const [suggestions, photos] = await Promise.all([
                        getDisplayNameSuggestions(targetAccountId),
                        getPastProfilePhotos(targetAccountId),
                    ]);
                    setNameSuggestions(suggestions);
                    setPastPhotos(photos);
                    const publicResources = await getPublicDisplayImages(targetAccountId);
                    setPublicPhotos(publicResources);

                    const currentName = currentDisplayName;
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
                        accountPhoto: targetProfile.accountPhoto || "",
                    });
                }
                setLoading(false);
            }
            fetchSuggestions();
        }
    }, [targetProfile, targetAccountId, currentDisplayName, nameForm, photoForm]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !targetAccountId) return;

        startPhotoTransition(async () => {
            const contentId = `profile-photo-${targetAccountId}-${Date.now()}`;
            const result = await uploadFile(file, "neup.account", contentId, file.name, targetAccountId);
            if(result.success && result.url) {
                const updateResult = await updateUserProfile(targetAccountId, { accountPhoto: result.url });
                if(updateResult.success) {
                    toast({ title: "Success", description: "Profile photo updated.", className: "bg-accent text-accent-foreground" });
                    photoForm.setValue('accountPhoto', result.url, { shouldDirty: true });
                    setPastPhotos(prev => [result.url as string, ...prev].slice(0, 4));
                    selectedProfile ? await refreshSelectedProfile() : refetchSession();
                } else {
                    toast({ variant: "destructive", title: "Error", description: updateResult.error });
                }
            } else {
                 toast({ variant: "destructive", title: "Upload Failed", description: result.error });
            }
        });
    };
    
    const onPhotoSubmit = (data: PhotoFormValues) => {
        if (!targetAccountId) return;
        startPhotoTransition(async () => {
            const result = await updateUserProfile(targetAccountId, { accountPhoto: data.accountPhoto });
            if (result.success) {
                toast({ title: "Success", description: "Profile photo updated.", className: "bg-accent text-accent-foreground" });
                photoForm.reset(data); // Resets the form's dirty state
                selectedProfile ? await refreshSelectedProfile() : refetchSession();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };

    const onNameSubmit = (data: NameFormValues) => {
        if (!targetAccountId || !targetProfile) {
            toast({ variant: "destructive", title: "Error", description: "Not authenticated or profile missing." });
            return;
        }

        startNameTransition(async () => {
            let payload: Record<string, any> = {};
            let isApprovalNeeded = true;
            
            const sanitizedCustomName = data.customDisplayName?.trim().replace(/\s+/g, ' ') || '';

            if (data.selectedDisplayName === 'custom') {
                if (isBrandAccount) {
                    payload = { customDisplayNameRequest: sanitizedCustomName };
                } else {
                const lowerCustomName = sanitizedCustomName.toLowerCase();

                // 1. Check if it's a case-insensitive match for a standard format.
                const isStandardFormat = nameSuggestions.some(suggestion => suggestion.toLowerCase() === lowerCustomName);
                if (isStandardFormat) {
                    payload = { nameDisplay: sanitizedCustomName };
                    isApprovalNeeded = false;
                } else {
                    // 2. Check if it's an extension of the current custom display name.
                    const currentNameIsStandard = nameSuggestions.some(s => s.toLowerCase() === targetProfile.nameDisplay?.toLowerCase());
                    if (!currentNameIsStandard && targetProfile.nameDisplay) {
                        const nameParts = [targetProfile.nameFirst, targetProfile.nameMiddle, targetProfile.nameLast].filter(Boolean).map(n => n!.toLowerCase());
                        const currentCustomLower = targetProfile.nameDisplay.toLowerCase();
                        
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
                }

            } else {
                // A standard format was selected.
                payload = { nameDisplay: data.selectedDisplayName };
                isApprovalNeeded = false;
            }

            const result = await updateUserProfile(targetAccountId, payload);

            if (result.success) {
                toast({ title: "Success", description: result.message, className: "bg-accent text-accent-foreground" });
                if(!isApprovalNeeded) {
                    nameForm.setValue('customDisplayName', '');
                }
                nameForm.reset(data); // Resets the form's dirty state
                selectedProfile ? await refreshSelectedProfile() : refetchSession();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    }

    const handleStandardDisplayNameSelect = (value: string) => {
        nameForm.setValue('selectedDisplayName', value, { shouldDirty: true });
        nameForm.setValue('customDisplayName', '', { shouldDirty: false });

        if (!isBrandAccount || !targetAccountId) {
            return;
        }

        if (value === currentDisplayName) {
            return;
        }

        startNameTransition(async () => {
            const result = await updateUserProfile(targetAccountId, { nameDisplay: value });

            if (result.success) {
                toast({ title: "Success", description: "Display name updated.", className: "bg-accent text-accent-foreground" });
                nameForm.reset({ selectedDisplayName: value, customDisplayName: "" });
                selectedProfile ? await refreshSelectedProfile() : refetchSession();
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };
    
    const selectedDisplayName = nameForm.watch('selectedDisplayName');
    const currentDisplayPhoto = photoForm.watch('accountPhoto');
    const displayNameOptions = isBrandAccount
        ? [
            { label: 'Brand Name', value: targetProfile?.brandName || '' },
            { label: 'Legal Name', value: targetProfile?.nameLegal || '' },
        ].filter((option) => option.value.trim().length > 0)
        : nameSuggestions.map((name) => ({ label: name, value: name }));
    const profileGender = (targetProfile?.gender || '').toLowerCase();
    const filteredPublicPhotos = publicPhotos.filter((photo) => {
        if (profileGender === 'male') return photo.type === 'displayImage_publicMale';
        if (profileGender === 'female') return photo.type === 'displayImage_publicFemale';
        if (profileGender === 'custom') return true;
        return true;
    });
    const displayImageOutlineClass = 'ring-1 ring-black/10';

    if (loading || loadingSelectedProfile) {
        return <Skeleton className="h-96 w-full" />
    }

    return (
        <div className="space-y-8">
            <BackButton href={profileBackHref} />

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
                                    <Avatar className={cn("h-36 w-36 rounded-lg", displayImageOutlineClass)}>
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
                                                            className={cn(
                                                                "relative p-1 aspect-square w-24 h-24 flex-shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                                                displayImageOutlineClass,
                                                            )}
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
                                                <div className={cn(
                                                    "flex flex-wrap items-start gap-2 pb-4 overflow-hidden transition-[max-height]",
                                                    showAllPublicPhotos ? "max-h-[999px]" : "max-h-16"
                                                )}>
                                                    {filteredPublicPhotos.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground">
                                                            No default public images available for your gender yet.
                                                        </p>
                                                    ) : (
                                                        filteredPublicPhotos.map((photo) => (
                                                            <button
                                                                type="button"
                                                                key={photo.id}
                                                                className={cn(
                                                                    "relative p-1 h-16 w-16 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                                                    displayImageOutlineClass,
                                                                )}
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
                                                <div className="flex items-center gap-4 text-sm">
                                                    {filteredPublicPhotos.length > 0 && (
                                                        <button
                                                            type="button"
                                                            className="text-primary underline p-0 h-auto"
                                                            onClick={() => setShowAllPublicPhotos((current) => !current)}
                                                        >
                                                            {showAllPublicPhotos ? 'Show less' : 'Show more'}
                                                        </button>
                                                    )}
                                                    <button type="button" className="text-primary underline p-0 h-auto" onClick={() => setPhotoView('uploader')}>
                                                        Upload new photo
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                            {photoFormState.isDirty ? (
                                <CardFooter className="border-t pt-4 mt-4 flex justify-start">
                                    <Button type="submit" disabled={isPhotoPending}>
                                        {isPhotoPending ? <Loader2 className="animate-spin" /> : "Save"}
                                    </Button>
                                </CardFooter>
                            ) : null}
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
                                    <h3 className="text-2xl font-semibold tracking-tight">{currentDisplayName}</h3>
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
                                                    {displayNameOptions.map((option) => (
                                                        <Button
                                                            key={`${option.label}:${option.value}`}
                                                            type="button"
                                                            variant={field.value === option.value ? "default" : "secondary"}
                                                            onClick={() => {
                                                                field.onChange(option.value);
                                                                handleStandardDisplayNameSelect(option.value);
                                                            }}
                                                            className="relative"
                                                            disabled={isNamePending}
                                                        >
                                                            {field.value === option.value && <Check className="absolute -left-1 -top-1 h-4 w-4 bg-primary text-primary-foreground rounded-full p-0.5" />}
                                                            {option.label}
                                                        </Button>
                                                    ))}
                                                    <Button
                                                        type="button"
                                                        variant={field.value === 'custom' ? "default" : "secondary"}
                                                        onClick={() => field.onChange('custom')}
                                                        className="relative"
                                                        disabled={isNamePending}
                                                    >
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
                                 <Button type="submit" disabled={isNamePending || !nameForm.formState.isDirty || selectedDisplayName !== 'custom'}>
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
