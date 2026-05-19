<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Grammar parser app</title>
	<meta
		name="description"
		content="An interactive grammar parser for LL(1), LR(0), LR(1), and LALR(1) grammars."
	/>
</svelte:head>

<div class="container">
	<div class="info-card">
		<h1 class="title">Grammar parser app</h1>
		<p class="description">
			This application allows you to define, analyze, and parse Context-Free Grammars. You can write
			your grammar in raw BNF format or build it visually using productions.
		</p>

		<div class="parser-types">
			<ul>
				<li><strong>LL(1)</strong> parser with First & Follow calculations.</li>
				<li>
					<strong>LR(0), LR(1), LALR(1)</strong> parsers with transition graphs (AFN) and action tables.
				</li>
				<li><strong>Recursive Descent</strong> parsing with visual AST tree rendering.</li>
			</ul>
		</div>

		<div class="actions">
			<a href={resolve('/parse')} class="btn-primary">Go to Parser</a>
		</div>

		<hr />

		<div class="footer-about">
			<p>
				Created by <a href="https://github.com/oczi" target="_blank" rel="noopener noreferrer"
					>github.com/oczi</a
				>
			</p>
		</div>
	</div>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 70vh;
		padding: 2rem;
	}

	.info-card {
		background: #fff;
		border: 1px solid #dee2e6;
		border-radius: 12px;
		padding: 2.5rem;
		max-width: 600px;
		width: 100%;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
	}

	.title {
		font-size: 2rem;
		font-weight: 700;
		color: #212529;
		margin-top: 0;
		margin-bottom: 1rem;
	}

	.description {
		font-size: 1.05rem;
		color: #495057;
		line-height: 1.5;
		margin-bottom: 1.5rem;
	}

	.parser-types ul {
		margin-bottom: 2rem;
		padding-left: 1.5rem;
		color: #495057;
		line-height: 1.6;
	}

	.parser-types li {
		margin-bottom: 0.5rem;
	}

	.actions {
		display: flex;
		margin-bottom: 2rem;
	}

	.btn-primary {
		display: inline-block;
		background-color: #0d6efd;
		color: #fff;
		padding: 0.6rem 1.5rem;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 600;
		text-decoration: none;
		transition: background-color 0.2s ease;
	}

	.btn-primary:hover {
		background-color: #0b5ed7;
	}

	hr {
		border: 0;
		border-top: 1px solid #dee2e6;
		margin-bottom: 1.5rem;
	}

	.footer-about {
		font-size: 0.9rem;
		color: #6c757d;
	}

	.footer-about a {
		color: #0d6efd;
		text-decoration: none;
		font-weight: 500;
	}

	.footer-about a:hover {
		text-decoration: underline;
	}
</style>
