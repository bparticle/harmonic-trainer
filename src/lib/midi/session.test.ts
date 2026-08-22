import { describe, expect, it } from 'vitest';
import { MidiSession } from './session.svelte';

describe('MIDI session subscriptions', () => {
	it('lets a high-priority layer claim a pedal press', () => {
		const session = new MidiSession();
		const calls: string[] = [];

		session.onPedal(() => {
			calls.push('page');
		});
		session.onPedal(
			() => {
				calls.push('tour');
				return true;
			},
			{ priority: 100 }
		);

		session.push({ type: 'sustain', down: true, time: 0 });

		expect(calls).toEqual(['tour']);
		session.destroy();
	});

	it('restores the page pedal action when the claiming layer unsubscribes', () => {
		const session = new MidiSession();
		const calls: string[] = [];
		session.onPedal(() => {
			calls.push('page');
		});
		const stopTour = session.onPedal(() => true, { priority: 100 });

		stopTour();
		session.push({ type: 'sustain', down: true, time: 0 });

		expect(calls).toEqual(['page']);
		session.destroy();
	});

	it('notifies independent note listeners until each one unsubscribes', () => {
		const session = new MidiSession();
		const first: number[] = [];
		const second: number[] = [];
		session.onNote((note) => first.push(note));
		const stopSecond = session.onNote((note) => second.push(note));

		session.push({ type: 'noteon', note: 60, velocity: 90, time: performance.now() });
		stopSecond();
		session.push({ type: 'noteon', note: 64, velocity: 90, time: performance.now() });

		expect(first).toEqual([60, 64]);
		expect(second).toEqual([60]);
		session.destroy();
	});
});
