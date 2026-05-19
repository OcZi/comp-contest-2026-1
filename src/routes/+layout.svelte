<script lang="ts">
	import Footer from './Footer.svelte';
	import Header from './Header.svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Parser collection UTEC</title>
</svelte:head>

<div class="app">
	<Header />
	<main>{@render children()}</main>

	<Footer />
</div>

<div style="display:none"></div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 1rem;
		width: 100%;
		max-width: 64rem;
		margin: 0 auto;
		box-sizing: border-box;
	}
</style>
