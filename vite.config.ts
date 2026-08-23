import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		}),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Harmonic Trainer',
				short_name: 'Harmonic',
				description: 'A harmonic wheel for practising chord progressions.',
				lang: 'en',
				theme_color: '#0c0d11',
				background_color: '#0c0d11',
				display: 'standalone',
				// Landscape-first on a music stand, but never lock orientation.
				orientation: 'any',
				start_url: '/',
				icons: [
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
				]
			},
			workbox: {
				// The practice shell must survive a dead network mid-session, so
				// everything it needs — including the self-hosted fonts — is precached.
				globPatterns: ['**/*.{js,css,html,woff2,svg,webmanifest}']
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.integration.test.ts']
				}
			},
			{
				// A database, unlike the rest of the suite — see
				// src/lib/server/db/index.ts, which refuses to run these anywhere
				// but TEST_DATABASE_URL. Not part of `npm test`/`verify`, so the
				// default suite stays exactly as fast and DB-free as it always was.
				extends: './vite.config.ts',
				test: {
					name: 'integration',
					environment: 'node',
					include: ['src/**/*.integration.test.ts']
				}
			}
		]
	}
});
