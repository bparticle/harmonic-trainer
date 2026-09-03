<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Reset password · Roundel</title></svelte:head>

<main class="grid min-h-dvh place-items-center px-6">
	<div class="w-full max-w-sm">
		<h1 class="font-display text-ink text-4xl leading-none font-semibold tracking-tight">
			Reset your password
		</h1>
		<p class="text-ink-dim mt-2 font-mono text-xs tracking-widest uppercase">
			We'll email you a link
		</p>

		{#if form?.sent}
			<p
				class="border-ground-line bg-ground-raised text-ink-muted mt-6 rounded-lg border px-3 py-2 text-sm"
			>
				If that email has an account, a reset link is on its way.
			</p>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
					};
				}}
			>
				<label class="mt-10 block">
					<span class="text-ink-muted font-mono text-xs tracking-widest uppercase">Email</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						name="email"
						type="email"
						autocomplete="email"
						autocapitalize="none"
						value={form?.email ?? ''}
						autofocus
						required
						class="border-ground-line bg-ground-raised text-ink focus:border-ink-dim mt-2 w-full rounded-lg border px-4 py-3 text-lg"
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
					{pending ? 'Sending…' : 'Send reset link'}
				</button>
			</form>
		{/if}

		<a
			href="/login"
			class="text-ink-dim hover:text-ink mt-6 block font-mono text-xs tracking-widest uppercase"
		>
			Back to sign in
		</a>
	</div>
</main>
