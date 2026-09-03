<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Roundel</title></svelte:head>

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
			Roundel
		</h1>
		<p class="text-ink-dim mt-2 font-mono text-xs tracking-widest uppercase">
			Every key is a station
		</p>
		{#if data.notice}
			<p
				class="border-ground-line bg-ground-raised text-ink-muted mt-6 rounded-lg border px-3 py-2 text-sm"
			>
				{data.notice}
			</p>
		{/if}

		<label class={data.notice ? 'mt-6 block' : 'mt-10 block'}>
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

		<label class="mt-5 block">
			<span class="text-ink-muted font-mono text-xs tracking-widest uppercase">Password</span>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
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
			{pending ? 'Checking…' : 'Sign in'}
		</button>

		<a
			href="/forgot-password"
			class="text-ink-dim hover:text-ink mt-6 block font-mono text-xs tracking-widest uppercase"
		>
			Forgot password?
		</a>
	</form>
</main>
