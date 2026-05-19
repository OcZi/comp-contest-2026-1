<script lang="ts">
	import { EPSILON } from './grammar_regex';

	const SPECIAL_SYMBOLS = [
		{ name: 'Epsilon', value: EPSILON },
		{ name: 'Arrow', value: '->' },
		{ name: 'Newline', value: '\n' }
	];

	interface Props {
		onSymbolClick?: (symbol: string) => void;
	}

	let { onSymbolClick }: Props = $props();
</script>

<div class="grammar-keyboard">
	<span class="grammar-span">Virtual keyboard</span>

	<div class="symbols-grid">
		{#each SPECIAL_SYMBOLS as item (item)}
			<button
				class="symbol-btn"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => onSymbolClick?.(item.value)}
			>
				{item.name} ({item.value})
			</button>
		{/each}
	</div>
</div>

<style>
	.grammar-keyboard {
		padding: 1rem;
		background-color: white;
		border-radius: 1.5rem;
	}

	.grammar-span {
		display: block;
		font-size: 1.5rem;
		font-weight: bold;
		text-align: left !important;
		margin: 0;
		padding: 0;
	}

	.symbols-grid {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 0.5rem;
	}
	.symbol-btn {
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f9f9f9;
		cursor: pointer;
		font-family: monospace;
		font-size: 0.8rem;
	}
	.symbol-btn:hover {
		background: #e0e0e0;
	}
</style>
