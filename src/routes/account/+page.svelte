<script lang="ts">
	import UserAvatar from '$lib/components/UserAvatar.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Account · Harmonic Trainer</title></svelte:head>

<main class="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
	<header class="flex items-center gap-4 sm:gap-5">
		<UserAvatar name={data.user?.name ?? 'Account'} size={68} />
		<div class="min-w-0">
			<p class="text-ink-dim font-mono text-xs tracking-widest uppercase">Account</p>
			<h1 class="font-display text-ink mt-1 truncate text-4xl font-semibold tracking-tight">
				{data.user?.name}
			</h1>
			<p class="text-ink-muted mt-1 truncate">{data.user?.email}</p>
		</div>
	</header>

	<section class="border-ground-line mt-10 rounded-xl border p-5 sm:p-6">
		<h2 class="text-ink text-xl font-semibold">Change password</h2>
		<p class="text-ink-muted mt-1 text-sm leading-relaxed">
			Changing it signs this account out on every device.
		</p>

		<form method="POST" action="?/password" class="mt-5 grid gap-4">
			<label>
				<span class="text-ink-dim font-mono text-xs">Current password</span>
				<input
					name="currentPassword"
					type="password"
					autocomplete="current-password"
					required
					class="border-ground-line bg-ground-raised text-ink mt-1.5 w-full rounded-lg border px-3 py-2.5"
				/>
			</label>
			<label>
				<span class="text-ink-dim font-mono text-xs">New password · 12 characters or more</span>
				<input
					name="newPassword"
					type="password"
					autocomplete="new-password"
					minlength="12"
					required
					class="border-ground-line bg-ground-raised text-ink mt-1.5 w-full rounded-lg border px-3 py-2.5"
				/>
			</label>
			<label>
				<span class="text-ink-dim font-mono text-xs">Repeat new password</span>
				<input
					name="confirmPassword"
					type="password"
					autocomplete="new-password"
					minlength="12"
					required
					class="border-ground-line bg-ground-raised text-ink mt-1.5 w-full rounded-lg border px-3 py-2.5"
				/>
			</label>
			{#if form?.passwordError}
				<p class="font-mono text-sm" style="color: var(--pc-0)">{form.passwordError}</p>
			{/if}
			<button class="bg-ink text-ground justify-self-start rounded-lg px-4 py-2.5 font-semibold">
				Change password
			</button>
		</form>
	</section>

	<section class="border-ground-line mt-5 flex flex-wrap gap-3 rounded-xl border p-5 sm:p-6">
		<form method="POST" action="?/revoke">
			<button class="border-ground-line hover:border-ink-dim rounded-lg border px-4 py-2.5 text-sm">
				Sign out everywhere
			</button>
		</form>
		<form method="POST" action="/logout">
			<button class="text-ink-muted hover:text-ink px-4 py-2.5 text-sm">Sign out here</button>
		</form>
	</section>
</main>
