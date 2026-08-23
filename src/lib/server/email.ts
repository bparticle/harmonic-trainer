import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';

/*
 * Maileroo over SMTP. Host and port are the provider's own and do not vary
 * per account, so they are constants here rather than more environment
 * variables to keep in sync — only the credentials and the from-address
 * come from the environment.
 *
 * Port 587 with STARTTLS, per Maileroo's own documentation (465 with
 * implicit TLS and 2525 are also offered, for networks that block 587).
 */
const HOST = 'smtp.maileroo.com';
const PORT = 587;

let transporter: Transporter | null = null;

function transport(): Transporter {
	if (!transporter) {
		const user = env.SMTP_USERNAME;
		const pass = env.SMTP_PW;
		if (!user || !pass) throw new Error('SMTP_USERNAME / SMTP_PW is not set');
		transporter = nodemailer.createTransport({
			host: HOST,
			port: PORT,
			secure: false,
			auth: { user, pass }
		});
	}
	return transporter;
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
	const from = env.MAIL_FROM;
	if (!from) throw new Error('MAIL_FROM is not set');
	await transport().sendMail({ from, to, subject, text });
}
