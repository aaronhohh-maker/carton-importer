import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'
import type { BulkJob, BulkJobImport } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com'
const TO_EMAIL = process.env.NOTIFICATION_EMAIL ?? ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

// ---------------------------------------------------------------------------
// sendBulkJobSummary
// ---------------------------------------------------------------------------
export async function sendBulkJobSummary(bulkJobId: string): Promise<void> {
  const supabase = createServiceClient()

  // Load bulk job with its imports
  const { data: job, error: jobError } = await supabase
    .from('bulk_jobs')
    .select('*, imports(*)')
    .eq('id', bulkJobId)
    .single()

  if (jobError || !job) {
    throw new Error(`Failed to load bulk job ${bulkJobId}: ${jobError?.message ?? 'not found'}`)
  }

  const bulkJob = job as BulkJob & { imports?: BulkJobImport[] }
  const imports: BulkJobImport[] = bulkJob.imports ?? []
  const failedImports = imports.filter((i) => i.status === 'failed')

  const dashboardUrl = `${APP_URL}/products`
  const finishedAt = bulkJob.finished_at
    ? new Date(bulkJob.finished_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    : 'N/A'

  // Build failed imports rows
  const failedRows =
    failedImports.length > 0
      ? failedImports
          .map(
            (i) => `
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;word-break:break-all;">
            <a href="${i.url}" style="color:#4f46e5;">${i.url}</a>
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#dc2626;">failed</td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">No failures</td></tr>`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#4f46e5;padding:24px 32px;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">+Carton</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#c7d2fe;">Bulk import complete</p>
            </td>
          </tr>
          <!-- Summary cards -->
          <tr>
            <td style="padding:24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="background:#f0fdf4;border-radius:6px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:28px;font-weight:700;color:#15803d;">${bulkJob.completed}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:.05em;">Imported</p>
                  </td>
                  <td width="4%"></td>
                  <td width="33%" style="background:#fef2f2;border-radius:6px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626;">${bulkJob.failed}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:.05em;">Failed</p>
                  </td>
                  <td width="4%"></td>
                  <td width="26%" style="background:#f5f3ff;border-radius:6px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:28px;font-weight:700;color:#4f46e5;">${bulkJob.total_urls}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#3730a3;text-transform:uppercase;letter-spacing:.05em;">Total</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Meta -->
          <tr>
            <td style="padding:16px 32px 0;">
              <p style="margin:0;font-size:13px;color:#6b7280;">
                <strong>Job ID:</strong> ${bulkJob.id}<br>
                <strong>Finished:</strong> ${finishedAt}<br>
                ${bulkJob.csv_filename ? `<strong>CSV:</strong> ${bulkJob.csv_filename}<br>` : ''}
              </p>
            </td>
          </tr>
          ${
            failedImports.length > 0
              ? `<!-- Failed imports table -->
          <tr>
            <td style="padding:24px 32px 0;">
              <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Failed imports</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">URL</th>
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Status</th>
                  </tr>
                </thead>
                <tbody>${failedRows}</tbody>
              </table>
            </td>
          </tr>`
              : ''
          }
          <!-- CTA -->
          <tr>
            <td style="padding:24px 32px 32px;">
              <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">
                View dashboard &rarr;
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">This is an automated message from +Carton. Do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const subject = `+Carton: Bulk import complete — ${bulkJob.completed}/${bulkJob.total_urls} products imported`

  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject,
    html,
  })
}

// ---------------------------------------------------------------------------
// sendImportFailureAlert
// ---------------------------------------------------------------------------
export async function sendImportFailureAlert(importId: string, error: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: importRecord, error: importError } = await supabase
    .from('imports')
    .select('id, url, status, created_at, bulk_job_id')
    .eq('id', importId)
    .single()

  if (importError || !importRecord) {
    throw new Error(`Failed to load import ${importId}: ${importError?.message ?? 'not found'}`)
  }

  const productUrl: string = importRecord.url ?? 'unknown'
  const dashboardUrl = `${APP_URL}/products`
  const createdAt = importRecord.created_at
    ? new Date(importRecord.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    : 'N/A'

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#dc2626;padding:24px 32px;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">+Carton</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#fecaca;">Import failure alert</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;width:120px;">Field</th>
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Value</th>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-weight:500;">Import ID</td>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;font-family:monospace;">${importId}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-weight:500;">Product URL</td>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;word-break:break-all;">
                    <a href="${productUrl}" style="color:#4f46e5;">${productUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-weight:500;">Error</td>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#dc2626;font-family:monospace;white-space:pre-wrap;">${escapeHtml(error)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-weight:500;">Started</td>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;">${createdAt}</td>
                </tr>
                ${
                  importRecord.bulk_job_id
                    ? `<tr>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-weight:500;">Bulk Job</td>
                  <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;font-family:monospace;">${importRecord.bulk_job_id}</td>
                </tr>`
                    : ''
                }
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;">
              <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">
                View products &rarr;
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">This is an automated message from +Carton. Do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const shortUrl =
    productUrl.length > 60 ? productUrl.slice(0, 57) + '...' : productUrl

  const subject = `+Carton: Import failed — ${shortUrl}`

  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject,
    html,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
