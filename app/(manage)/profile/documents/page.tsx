
"use client";

import { useState, useTransition, useEffect, useRef } from 'react';
import { notFound } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/core/hooks/use-toast';
import { kycFormSchema, type KycFormValues } from '@/services/manage/profile/schema';
import { submitKyc } from '@/services/manage/profile/documents';
import { uploadFile } from '@/services/upload';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BackButton } from '@/components/ui/back-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Camera, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useSession } from '@/core/providers/session';
import { PROFILE_SECTION_PERMISSIONS, hasAnyPermission } from '@/core/auth/profile-permissions';
import { permission } from '@/neup.logica/permission';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { redirectInApp } from '@/core/helper/navigation';
import { useSelectedProfilePage } from '../use-selected-profile-page';

const pagePermissions = [
    permission('profile.kyc.view.self', 'for_individual', 'page'),
    permission('profile.kyc.update.self', 'for_individual', 'page'),
];

// Helper function to convert dataURL to File object
function dataURLtoFile(dataurl: string, filename: string): File {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) {
        throw new Error('Invalid data URL');
    }
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}


function WebcamCapture({ onCapture }: { onCapture: (file: File) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const {toast} = useToast();

    useEffect(() => {
        const getCameraPermission = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({video: true});
            setHasCameraPermission(true);

            if (videoRef.current) {
            videoRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error('Error accessing camera:', error);
            setHasCameraPermission(false);
            toast({
            variant: 'destructive',
            title: 'Camera Access Denied',
            description: 'Please enable camera permissions in your browser settings to use this app.',
            });
        }
        };

        getCameraPermission();

        return () => {
             if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        }
    }, [toast]);
    
    const handleCapture = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            const file = dataURLtoFile(dataUrl, 'selfie.jpg');
            onCapture(file);
        }
    };

    return (
        <div className="space-y-2">
            <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
            {hasCameraPermission === false && (
                <Alert variant="destructive">
                    <AlertTitle>Camera Access Required</AlertTitle>
                    <AlertDescription>Please allow camera access to use this feature.</AlertDescription>
                </Alert>
            )}
            <Button type="button" onClick={handleCapture} disabled={!hasCameraPermission}>
                <Camera className="mr-2 h-4 w-4" />
                Capture Selfie
            </Button>
        </div>
    );
}

export default function KycPage() {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitted, setIsSubmitted] = useState(false);
    const {
        profile: sessionProfile,
        accountId: sessionAccountId,
        permissions: sessionPermissions,
        loading: sessionLoading,
    } = useSession();
    const {
        selectedProfileDenied,
        loadingSelectedProfile,
        targetAccountId,
        targetPermissions,
        profileBackHref,
    } = useSelectedProfilePage({
        requiredPermissions: PROFILE_SECTION_PERMISSIONS.kyc,
        sessionAccountId,
        sessionPermissions,
        sessionProfile,
    });

    if (selectedProfileDenied) {
        notFound();
    }

    if (!sessionLoading && !loadingSelectedProfile && !hasAnyPermission(targetPermissions, PROFILE_SECTION_PERMISSIONS.kyc)) {
        notFound();
    }

    const form = useForm<KycFormValues>({
        resolver: zodResolver(kycFormSchema),
        defaultValues: {
            documentType: 'passport',
        }
    });

    const onSubmit = (data: KycFormValues) => {
        if (!targetAccountId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not identify user.' });
            return;
        }

        startTransition(async () => {
            try {
                toast({title: "Uploading files...", description: "Please wait while we upload your documents."});

                const [docUploadResult, selfieUploadResult] = await Promise.all([
                    uploadFile(data.documentPhoto, "neup.account", crypto.randomUUID(), data.documentPhoto.name, targetAccountId),
                    uploadFile(data.selfiePhoto, "neup.account", crypto.randomUUID(), data.selfiePhoto.name, targetAccountId),
                ]);

                if (!docUploadResult.success || !selfieUploadResult.success || !docUploadResult.contentId || !selfieUploadResult.contentId) {
                    toast({ variant: "destructive", title: "Upload Failed", description: docUploadResult.error || selfieUploadResult.error || "Could not upload files." });
                    return;
                }

                toast({title: "Upload complete!", description: "Submitting your information for review."});

                const submissionData = {
                    documentType: data.documentType,
                    documentId: data.documentId,
                    documentPhotoUrl: docUploadResult.url as string,
                    documentPhotoContentId: docUploadResult.contentId,
                    selfiePhotoUrl: selfieUploadResult.url as string,
                    selfiePhotoContentId: selfieUploadResult.contentId,
                };

                const result = await submitKyc(targetAccountId, submissionData);
                if (result.success) {
                    setIsSubmitted(true);
                } else {
                    toast({ variant: 'destructive', title: 'Submission Failed', description: result.error });
                }
            } catch (e) {
                console.error(e);
                toast({ variant: 'destructive', title: 'Error', description: "An unexpected error occurred." });
            }
        });
    };

    if (loadingSelectedProfile) {
        return <Skeleton className="h-64 w-full" />;
    }

    if (isSubmitted) { // Success screen
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <h1 className="text-2xl font-bold">KYC Submitted Successfully!</h1>
                <p className="text-muted-foreground mt-2">Your information is now under review. We will notify you once the process is complete.</p>
                <Button onClick={() => redirectInApp(router, profileBackHref)} className="mt-6">Back to Profile</Button>
            </div>
        )
    }

    return (
        <div className="grid gap-8">
            <BackButton href={profileBackHref} />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">KYC & Verification</h1>
                <p className="text-muted-foreground">Verify your identity to unlock all features of your account.</p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Document Upload</CardTitle>
                            <CardDescription>Upload a government-issued ID and a selfie.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField name="documentType" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>Document Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent><SelectItem value="passport">Passport</SelectItem><SelectItem value="license">Driver's License</SelectItem><SelectItem value="national_id">National ID Card</SelectItem></SelectContent>
                                    </Select>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField name="documentId" control={form.control} render={({ field }) => (<FormItem><FormLabel>Document ID Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                            
                            <FormField name="documentPhoto" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>Photo of Document</FormLabel><FormControl><Input type="file" accept="image/*,application/pdf" onChange={e => field.onChange(e.target.files?.[0] || null)} /></FormControl><FormMessage /></FormItem>
                            )}/>

                            <FormField name="selfiePhoto" control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>Selfie</FormLabel>
                                    <FormControl>
                                        <WebcamCapture onCapture={file => field.onChange(file)} />
                                    </FormControl>
                                <FormMessage /></FormItem>
                            )} />
                        </CardContent>
                    </Card>
                    
                    <div className="flex justify-end">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button type="button" disabled={isPending || !form.formState.isValid}>
                                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Submit for Verification
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Submit KYC Information?</AlertDialogTitle>
                                    <AlertDialogDescription>Please confirm you want to submit these details for review. This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={form.handleSubmit(onSubmit)}>
                                        Yes, Submit
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </form>
            </Form>
        </div>
    );
}
