<script lang="ts">
	import PlayAlong from '$lib/components/PlayAlong.svelte';

	/*
	 * Play along, for the player who owns this instance.
	 *
	 * The page itself is `PlayAlong.svelte`, because `/demo` renders the same
	 * thing for a visitor with no account. What is here is the half that needs a
	 * database: the charts you typed in, and the editor's last answer.
	 */

	let { data, form } = $props();
</script>

<PlayAlong mine={data.mine} {form} colorMap={data.settings.colorMap} />
