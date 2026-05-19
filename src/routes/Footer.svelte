<script lang="ts">
	import github from '$lib/images/github.svg';
</script>

<footer>
	<p>Compilers Contest @ UTEC CS3025</p>
	<a href="https://github.com/sveltejs/kit">
		<img src={github} alt="GitHub" />
	</a>
</footer>

<style>
	footer {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: center;
		padding: 12px;
		gap: 12px;
	}

	footer a {
		font-weight: bold;
	}

	@media (min-width: 480px) {
		footer {
			padding: 12px 0;
		}
	}

	svg {
		width: 2em;
		height: 3em;
		display: block;
	}

	path {
		fill: var(--background);
	}

	a img {
		width: 2em;
		height: 2em;
		object-fit: contain;
	}
</style>
