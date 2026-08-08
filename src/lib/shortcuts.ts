const INTERACTIVE_SELECTOR =
	'input, textarea, select, button, a, [contenteditable="true"], [role="button"]';

type ShortcutEvent = Pick<
	KeyboardEvent,
	'key' | 'defaultPrevented' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'
>;

/** True only when Space is an unmodified page shortcut, not an attempted control action. */
export function shouldHandleSpace(event: ShortcutEvent): boolean {
	if (
		event.key !== ' ' ||
		event.defaultPrevented ||
		event.repeat ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey
	) {
		return false;
	}

	const target = event.target as { closest?: (selector: string) => unknown } | null;
	return !(
		target &&
		typeof target.closest === 'function' &&
		Boolean(target.closest(INTERACTIVE_SELECTOR))
	);
}
