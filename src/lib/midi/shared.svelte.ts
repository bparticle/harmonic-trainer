import { MidiSession } from './session.svelte';

/**
 * One MIDI session for the whole app.
 *
 * Each page used to construct its own, which meant the connection died on every
 * navigation and had to be re-established — and on a page with no drill it was
 * simply absent, so the keyboard felt dead. A module-level instance survives
 * client-side routing because the module is only evaluated once.
 *
 * Constructing it here is safe during SSR: the class touches no browser API
 * until `detect`, `connect` or an input event is received, and the layout only
 * does that in the browser.
 */
export const midi = new MidiSession();

const REMEMBER_KEY = 'harmonic:midi-connected';

/**
 * Reconnect without asking, if permission was granted before.
 *
 * Web MIDI permission is remembered per origin, so a second `requestMIDIAccess`
 * does not prompt. Auto-connecting means the piano is simply live when the app
 * opens, instead of needing a button pressed at the start of every session.
 * First-time visitors still get the explicit prompt, from the settings menu.
 */
export async function restoreMidi(): Promise<void> {
	midi.detect();
	if (midi.status !== 'idle') return;

	if (await alreadyAllowed()) {
		await midi.connect();
		return;
	}

	if (typeof localStorage === 'undefined') return;
	if (localStorage.getItem(REMEMBER_KEY) !== 'yes') return;
	await midi.connect();
}

/**
 * Has this browser already granted MIDI access?
 *
 * Asking the Permissions API is better than trusting our own flag: permission
 * survives clearing site data that our flag does not, and it covers the case
 * where access was granted before this app started remembering. Not every
 * browser exposes `midi` as a queryable permission, so a failure here just
 * falls through to the stored flag.
 */
async function alreadyAllowed(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.permissions) return false;
	try {
		const status = await navigator.permissions.query({
			name: 'midi' as PermissionName,
			sysex: false
		} as PermissionDescriptor);
		return status.state === 'granted';
	} catch {
		return false;
	}
}

export async function connectMidi(): Promise<void> {
	await midi.connect();
	if (midi.status === 'ready' && typeof localStorage !== 'undefined') {
		localStorage.setItem(REMEMBER_KEY, 'yes');
	}
}

export function forgetMidi(): void {
	if (typeof localStorage !== 'undefined') localStorage.removeItem(REMEMBER_KEY);
}
