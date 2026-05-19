<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<header>
	<nav>
		<ul>
			<li aria-current={page.url.pathname === '/' ? 'page' : undefined}>
				<a href={resolve('/')}>Home</a>
			</li>
			<li aria-current={page.url.pathname === '/parse' ? 'page' : undefined}>
				<a href={resolve('/parse')}>Parser</a>
			</li>
			<li aria-current={page.url.pathname === '/about' ? 'page' : undefined}>
				<a href={resolve('/about')}>About</a>
			</li>
		</ul>
	</nav>
</header>

<style>
	header {
		display: flex;
		justify-content: center;
		margin-top: 1rem;
	}

	nav {
		display: flex;
		justify-content: center;
	}

	ul {
		position: relative;
		padding: 0.25rem;
		margin: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		list-style: none;
		background: rgba(255, 255, 255, 0.8);
		border: 1px solid #dee2e6;
		border-radius: 9999px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	li {
		position: relative;
	}

	nav a {
		display: flex;
		align-items: center;
		padding: 0.5rem 1.25rem;
		color: #495057;
		font-weight: 600;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-decoration: none;
		border-radius: 9999px;
		transition: all 0.2s ease;
	}

	li[aria-current='page'] a {
		background-color: #4a90d9;
		color: white;
	}

	nav a:hover:not([aria-current='page'] a) {
		background-color: rgba(0, 0, 0, 0.05);
		color: #212529;
	}
</style>
