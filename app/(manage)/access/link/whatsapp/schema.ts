import { z } from "zod";

export const whatsAppFormSchema = z.object({
    whatsappNumber: z.string().min(10, "Please enter a valid phone number."),
});

export const verifyCodeSchema = z.object({
    whatsappNumber: z.string(),
    code: z.string().length(6, "Code must be 6 digits."),
});
