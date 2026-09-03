export default function compileCSS(variables, [a1, a2]) {
  const anchors = `--anchorOne: oklch(${a1.L * 100}% ${a1.C} ${a1.D}); --anchorTwo: oklch(${a2.L * 100}% ${a2.C} ${a2.D});`
  return `<style>:root{${variables}; ${anchors}}</style>`
}
