<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Harmonic Trainer</title></svelte:head>

<main class="grid min-h-dvh place-items-center px-6">
	<form
		method="POST"
		class="w-full max-w-sm"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update();
				pending = false;
			};
		}}
	>
		<h1 class="font-display text-ink text-4xl leading-none font-semibold tracking-tight">
			Harmonic&nbsp;Trainer
		</h1>
		<p class="text-ink-dim mt-2 font-mono text-xs tracking-widest uppercase">
			Chord progressions, on the wheel
		</p>

		<label class="mt-10 block">
			<span class="text-ink-muted font-mono text-xs tracking-widest uppercase">Password</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				autofocus
				required
				class="border-ground-line bg-ground-raised text-ink focus:border-ink-dim mt-2 w-full
				       rounded-lg border px-4 py-3 text-lg outline-none
				       focus:ring-0"
			/>
		</label>

		{#if form?.error}
			<p class="mt-3 font-mono text-sm" style="color: var(--pc-0)">{form.error}</p>
		{/if}

		<button
			type="submit"
			disabled={pending}
			class="bg-ink text-ground mt-6 w-full rounded-lg px-4 py-3 text-lg font-semibold
			       transition-opacity disabled:opacity-40"
		>
			{pending ? 'Checking…' : 'Enter'}
		</button>
	</form>
</main>
