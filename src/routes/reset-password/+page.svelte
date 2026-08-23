<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Reset password · Harmonic Trainer</title></svelte:head>

<main class="grid min-h-dvh place-items-center px-6">
	<div class="w-full max-w-sm">
		<h1 class="font-display text-ink text-4xl leading-none font-semibold tracking-tight">
			Choose a new password
		</h1>

		{#if !data.valid}
			<p class="text-ink-muted mt-6 text-sm leading-relaxed">
				This link has expired or was already used.
				<a
					href="/forgot-password"
					class="text-ink decoration-ground-line hover:decoration-ink-dim underline underline-offset-4"
				>
					Request a new one
				</a>.
			</p>
		{:else}
			<form
				method="POST"
				class="mt-10 grid gap-4"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
					};
				}}
			>
				<label>
					<span class="text-ink-muted font-mono text-xs tracking-widest uppercase">
						New password · 12 characters or more
					</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						name="newPassword"
						type="password"
						autocomplete="new-password"
						minlength="12"
						autofocus
						required
						class="border-ground-line bg-ground-raised text-ink focus:border-ink-dim mt-2 w-full rounded-lg border px-4 py-3 text-lg"
					/>
				</label>
				<label>
					<span class="text-ink-muted font-mono text-xs tracking-widest uppercase">
						Repeat new password
					</span>
					<input
						name="confirmPassword"
						type="password"
						autocomplete="new-password"
						minlength="12"
						required
						class="border-ground-line bg-ground-raised text-ink focus:border-ink-dim mt-2 w-full rounded-lg border px-4 py-3 text-lg"
					/>
				</label>

				{#if form?.error}
					<p class="font-mono text-sm" style="color: var(--pc-0)">{form.error}</p>
				{/if}

				<button
					type="submit"
					disabled={pending}
					class="bg-ink text-ground mt-2 w-full rounded-lg px-4 py-3 text-lg font-semibold
					       transition-opacity disabled:opacity-40"
				>
					{pending ? 'Saving…' : 'Set new password'}
				</button>
			</form>
		{/if}
	</div>
</main>
