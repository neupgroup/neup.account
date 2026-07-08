'use server';

/*
::neup.documentation::neup-core-helper-logger
::title Logger Helper

Centralized error logging helpers for file-based and database-backed error traces.

::public

`logError()` writes structured error entries to the server console and to `neup.core/logs/error.log`.

`logSystemError()` writes lightweight persisted error records to the `system_error` table.

::public end

::private

The file log path is rooted at `process.cwd()/neup.core/logs/error.log` so the log file stays with the `neup.core` module rather than the legacy `core` folder path.

::private end

::end
*/

import { headers } from 'next/headers';
import { getActiveAccountId } from '@/neup.core/auth/verify';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma from '@/neup.core/helpers/prisma';

type LogType = 'ai' | 'database' | 'validation' | 'auth' | 'unknown' | 'webhook';
type ReportType = 'auto' | 'submitted';

export async function logError(
    type: LogType, 
    error: unknown, 
    context: string = 'No context',
    reportType: ReportType = 'auto'
) {
    let errorMessage: string;
    const ip = (await headers()).get('x-forwarded-for') || 'Unknown IP';
    const accountId = await getActiveAccountId();

    // Normalize the error into a string regardless of its original type
    if (error instanceof Error) {
        errorMessage = error.stack || error.message;
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else {
        try {
            errorMessage = JSON.stringify(error, null, 2);
        } catch {
            errorMessage = "Could not serialize the error object.";
        }
    }
    
    // Hash the first line of the error message to create a stable dedup signature
    const firstLine = errorMessage.split('\n')[0];
    const signature = crypto.createHash('md5').update(`${type}:${firstLine}`).digest('hex');

    const logEntry = {
        type,
        reportType,
        context,
        message: errorMessage,
        signature,
        ip,
        accountId,
        timestamp: new Date().toISOString(),
    };

    // eslint-disable-next-line no-console
    console.error("ERROR", logEntry);

    // File-based logging to /neup.core/logs/error.log
    try {
        const logFilePath = path.join(process.cwd(), 'neup.core', 'logs', 'error.log');
        const logDir = path.dirname(logFilePath);
        
        // Create the log directory if it doesn't exist yet
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logString = `[${logEntry.timestamp}] [${type}] [${reportType}] [${context}] [IP: ${ip}] [Account: ${accountId}] [Signature: ${signature}]\nMessage: ${errorMessage}\n${'-'.repeat(80)}\n`;
        
        fs.appendFileSync(logFilePath, logString, 'utf8');
    } catch (fileError) {
        // eslint-disable-next-line no-console
        console.error("CRITICAL: Could not write to error log file.", fileError);
    }
}

/**
 * Writes a lightweight system error record to the database.
 * Used for permission denial/debug logging when we want a persisted trace.
 */
export async function logSystemError(
    message: string,
    context: string = 'No context',
) {
    const ip = (await headers()).get('x-forwarded-for') || 'Unknown IP';
    const accountId = await getActiveAccountId();

    try {
        await prisma.systemError.create({
            data: {
                message,
                context,
                accountId,
                ipAddress: ip,
            },
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error("CRITICAL: Could not write system error record.", error);
    }
}
