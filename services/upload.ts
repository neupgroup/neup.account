
'use server';

import { getActiveAccountId, getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';

// Make sure to set this in your environment variables
const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL || 'https://neupgroup.com/usercontent/bridge/api/upload.php';

/**
 * Function compressImage.
 */
async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Failed to get canvas context'));
                }

                let { width, height } = img;
                const MAX_WIDTH = 1024;
                const MAX_HEIGHT = 1024;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                    }
                }, 'image/jpeg', 0.8); // Adjust quality to control size
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


/**
 * Function uploadFile.
 */
export async function uploadFile(
  file: File,
  platform: string,
  contentId: string,
  name?: string,
  forAccountId?: string,
): Promise<{ success: boolean; url?: string; error?: string; contentId?: string }> {
  
  const actorAccountId = await getPersonalAccountId();
  if (!actorAccountId) {
    return { success: false, error: 'User not authenticated.' };
  }
  
  const memberId = forAccountId || await getActiveAccountId();
   if (!memberId) {
    return { success: false, error: 'Target account could not be determined.' };
  }


  try {
    let fileToUpload = file;
    // This compression logic is not executed on the server, but is kept for potential client-side usage.
    // The server action environment does not have access to browser APIs like FileReader or Image.
    if (typeof window !== 'undefined' && file.type.startsWith('image/') && file.size > 100 * 1024) {
        try {
            fileToUpload = await compressImage(file);
        } catch (e) {
            console.error("Compression failed, uploading original file.", e);
        }
    }


    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('platform', platform);
    formData.append('userid', memberId);
    formData.append('contentid', contentId);
    if (name) {
      formData.append('name', name);
    }

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        const errorDetails = {
            status: response.status,
            statusText: response.statusText,
            responseText: errorText,
            requestData: { platform, userid: memberId, contentid: contentId, name },
            fileInfo: { name: file.name, size: file.size, type: file.type }
        };
        await logError('unknown', new Error(`Upload API failed: ${JSON.stringify(errorDetails)}`), 'file-upload');
        return { success: false, error: `Upload failed: ${response.statusText}` };
    }

    const result = await response.json();

    if (result.success && result.url) {
      const fullUrl = `https://neupgroup.com${result.url}`;

      return { success: true, url: fullUrl, contentId: contentId };
    } else if (result.success && !result.url) {
        const errorDetails = {
            apiMessage: "API returned success but no URL.",
            apiResponse: result,
            requestData: { platform, userid: memberId, contentid: contentId, name },
            fileInfo: { name: file.name, size: file.size, type: file.type }
        };
        await logError('unknown', new Error(`Upload API success with missing URL: ${JSON.stringify(errorDetails)}`), 'file-upload');
        return { success: false, error: "Upload succeeded but the server did not return a valid URL." };
    } else {
        const errorDetails = {
            apiMessage: result.message,
            requestData: { platform, userid: memberId, contentid: contentId, name },
            fileInfo: { name: file.name, size: file.size, type: file.type }
        };
      await logError('unknown', new Error(`Upload API returned an error: ${JSON.stringify(errorDetails)}`), 'file-upload');
      return { success: false, error: result.message || "An unknown error occurred during upload." };
    }

  } catch (error: any) {
    const errorDetails = {
        exception: error.message,
        requestData: { platform, userid: memberId, contentid: contentId, name },
        fileInfo: { name: file.name, size: file.size, type: file.type }
    };
    await logError('unknown', new Error(`Upload action failed: ${JSON.stringify(errorDetails)}`), 'uploadFile-action');
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
