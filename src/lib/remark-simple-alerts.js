/**
 * Minimal GitHub-style alert transform for mdsvex:
 *
 *   > [!NOTE]
 *   > Body text.
 *
 * becomes
 *
 *   <aside class="alert note"><h2>Note</h2><p>Body text.</p></aside>
 *
 * matching the `aside.alert` CSS already in DefaultStyles.css, which supplies
 * the icon itself via `content: var(--icon)` -- no icon assets/SVGs needed
 * here at all (unlike remark-alerts/remark-github-alerts).
 *
 * The one real wrinkle: remark parses "[!NOTE]" as a shortcut reference LINK
 * (bracket syntax), not plain text, so the marker shows up as either a plain
 * `text` node or a `linkReference` node wrapping one -- markerText() below
 * reads through either shape instead of assuming one, which is exactly what
 * remark-alerts gets wrong (it only checks for `text`, so it silently no-ops
 * on real `[!NOTE]` input).
 */
const SUPPORTED_TYPES = ['note', 'success', 'warning', 'danger'];

function markerText(node) {
	if (node.type === 'text') return node.value;
	if (node.children?.[0]?.type === 'text') return node.children[0].value;
	return '';
}

function walk(node, visit) {
	if (node.type === 'blockquote') visit(node);
	node.children?.forEach((child) => walk(child, visit));
}

export default function remarkSimpleAlerts() {
	return (tree) => {
		walk(tree, (node) => {
			const firstPara = node.children[0];
			const marker = firstPara?.children?.[0];
			if (!marker) return;
			const type = markerText(marker).match(/^!(\w+)/)?.[1].toLowerCase();
			if (!type || !SUPPORTED_TYPES.includes(type)) return;

			// Everything in the first paragraph after the marker is the start
			// of the body; drop the marker itself and trim the leading newline
			// left behind where it used to sit.
			const rest = firstPara.children.slice(1);
			if (rest[0]?.type === 'text') rest[0] = { ...rest[0], value: rest[0].value.replace(/^\s+/, '') };
			const bodyParagraphs = rest.length
				? [{ ...firstPara, children: rest }, ...node.children.slice(1)]
				: node.children.slice(1);

			node.data = { hName: 'aside', hProperties: { class: `alert ${type}` } };
			node.children = [
				{
					type: 'paragraph',
					data: { hName: 'h2' },
					children: [{ type: 'text', value: type[0].toUpperCase() + type.slice(1) }]
				},
				...bodyParagraphs
			];
		});
	};
}
