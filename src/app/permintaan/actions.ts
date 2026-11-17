"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";

const inquirySchema = z.object({
  inquiry_type: z.enum(["product_info", "order", "partnership", "complaint", "other"]),
  contact_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+() .-]{8,24}$/),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  preferred_contact: z.enum(["whatsapp", "phone", "email"]),
  message: z.string().trim().min(10).max(2000),
  consent: z.literal("on"),
  website: z.string().max(200).optional(),
}).superRefine((data, context) => {
  if (data.preferred_contact === "email" && !data.email) {
    context.addIssue({ code: "custom", path: ["email"], message: "Email wajib diisi jika memilih kontak email." });
  }
});

export async function createInquiry(formData: FormData) {
  const parsed = inquirySchema.safeParse({
    inquiry_type: formData.get("inquiry_type"),
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
    preferred_contact: formData.get("preferred_contact"),
    message: formData.get("message"),
    consent: formData.get("consent"),
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) redirect("/permintaan?error=invalid");

  // Honeypot: silently accept automated submissions without storing them.
  if (parsed.data.website) redirect("/permintaan?sent=1");

  const email = parsed.data.email || null;
  try {
    const inserted = await sql`
      WITH org AS (
        SELECT id FROM organizations
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      ),
      recent AS (
        SELECT EXISTS (
          SELECT 1
          FROM customer_inquiries i
          CROSS JOIN org
          WHERE i.organization_id = org.id
            AND i.created_at > now() - interval '10 minutes'
            AND (
              regexp_replace(i.phone, '[^0-9]', '', 'g') =
                regexp_replace(${parsed.data.phone}, '[^0-9]', '', 'g')
              OR (
                ${email}::text IS NOT NULL
                AND lower(i.email) = lower(${email}::text)
              )
            )
        ) AS blocked
      ),
      created AS (
        INSERT INTO customer_inquiries (
          organization_id, inquiry_type, contact_name, phone, email,
          preferred_contact, message, consent_at, source
        )
        SELECT
          org.id, ${parsed.data.inquiry_type}, ${parsed.data.contact_name},
          ${parsed.data.phone}, ${email}, ${parsed.data.preferred_contact},
          ${parsed.data.message}, now(), 'public_website'
        FROM org CROSS JOIN recent
        WHERE recent.blocked = false
        RETURNING id, organization_id, inquiry_type
      ),
      logged AS (
        INSERT INTO audit_logs (
          organization_id, actor_user_id, action, entity_type, entity_id, after_data
        )
        SELECT
          organization_id, NULL, 'PUBLIC_INQUIRY_CREATE', 'customer_inquiry',
          id::text, jsonb_build_object('inquiry_type', inquiry_type)
        FROM created
        RETURNING id
      )
      SELECT id FROM created
    `;

    if (inserted.length === 0) redirect("/permintaan?error=rate");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/permintaan?error=save");
  }

  redirect("/permintaan?sent=1");
}
