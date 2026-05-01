// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Email sending via Resend API.
 *
 * Uses the `RESEND_API_KEY` secret to send emails through https://api.resend.com.
 * This replaces the Cloudflare Email Service binding which requires a paid Workers plan.
 *
 * See: https://resend.com/docs/api-reference/emails/send-email
 */

export interface SendEmailParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { email: string; name: string };
	attachments?: {
		content: string; // base64 encoded
		filename: string;
		type: string;
		disposition: "attachment" | "inline";
		contentId?: string;
	}[];
	headers?: Record<string, string>;
}

function formatAddress(addr: string | { email: string; name: string }): string {
	if (typeof addr === "string") return addr;
	return `${addr.name} <${addr.email}>`;
}

/**
 * Send an email using the Resend API.
 *
 * @param apiKey   - The `RESEND_API_KEY` secret from env
 * @param params   - Email parameters (to, from, subject, body, etc.)
 * @returns The send result with messageId
 * @throws On validation or delivery errors
 */
export async function sendEmail(
	apiKey: string,
	params: SendEmailParams,
): Promise<{ messageId: string }> {
	const body: Record<string, unknown> = {
		from: formatAddress(params.from),
		to: Array.isArray(params.to) ? params.to : [params.to],
		subject: params.subject,
	};

	if (params.html) body.html = params.html;
	if (params.text) body.text = params.text;
	if (params.cc) body.cc = Array.isArray(params.cc) ? params.cc : [params.cc];
	if (params.bcc) body.bcc = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
	if (params.replyTo) body.reply_to = formatAddress(params.replyTo);

	if (params.headers && Object.keys(params.headers).length > 0) {
		body.headers = params.headers;
	}

	if (params.attachments && params.attachments.length > 0) {
		body.attachments = params.attachments.map((att) => ({
			content: att.content,
			filename: att.filename,
			type: att.type,
			...(att.disposition ? { disposition: att.disposition } : {}),
			...(att.contentId ? { content_id: att.contentId } : {}),
		}));
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		let errorDetail: string;
		try {
			const errorJson = (await response.json()) as { message?: string; name?: string };
			errorDetail = errorJson.message || errorJson.name || JSON.stringify(errorJson);
		} catch {
			errorDetail = await response.text();
		}
		throw new Error(`Resend API error ${response.status}: ${errorDetail}`);
	}

	const data = (await response.json()) as { id: string };
	return { messageId: data.id };
}
