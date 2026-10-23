// Builds the service page into site/dist: the page script (the mod's own composer,
// bundled), the styles, a favicon drawn by the mod, the mod's sounds and the demo videos.
// Usage: bun site/build.ts   (then serve site/dist, e.g. `bunx serve site/dist`)
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { frame, svgOf } from '../mod/hooks/sprite'

const ROOT = join(import.meta.dir, '..')
const SRC = join(import.meta.dir, 'src')
const OUT = join(import.meta.dir, 'dist')

await rm(OUT, { recursive: true, force: true })
await mkdir(join(OUT, 'media'), { recursive: true })

const built = await Bun.build({ entrypoints: [join(SRC, 'main.ts')], target: 'browser', minify: true })
if (!built.success) {
  for (const log of built.logs) console.error(log)
  process.exit(1)
}
const script = await built.outputs[0]!.text()
const style = await Bun.file(join(SRC, 'style.css')).text()
const short = (text: string) => Bun.hash(text).toString(36).slice(0, 8)
const scriptName = `app.${short(script)}.js`
const styleName = `style.${short(style)}.css`
await Bun.write(join(OUT, scriptName), script)
await Bun.write(join(OUT, styleName), style)
const html = (await Bun.file(join(SRC, 'index.html')).text()).replace('%APP%', scriptName).replace('%CSS%', styleName)
await Bun.write(join(OUT, 'index.html'), html)

// The favicon: CAPPL's small sprite, as the pane draws it.
await Bun.write(join(OUT, 'favicon.svg'), svgOf(frame({ character: 'cappl', look: { eyes: 'happy', blush: true }, tick: 0, equipped: [], size: 16 })))

// The mod's own sounds (the normal set) and the demo videos and posters.
for (const character of ['locki', 'cappl']) {
  await mkdir(join(OUT, 'sfx', character), { recursive: true })
  for (const file of await readdir(join(ROOT, 'mod/assets/sfx', character))) {
    if (file.endsWith('.wav')) await cp(join(ROOT, 'mod/assets/sfx', character, file), join(OUT, 'sfx', character, file))
  }
}
const media: [string, string][] = [
  ['docs/cappl-pals-demo.mp4', 'media/demo-en.mp4'],
  ['docs/cappl-pals-demo.ko.mp4', 'media/demo-ko.mp4'],
  ['docs/cappl-pals-demo-poster.png', 'media/poster-en.png'],
  ['docs/cappl-pals-demo-poster.ko.png', 'media/poster-ko.png'],
  ['docs/cappl-pals-demo-poster.png', 'og.png'],
]
for (const [from, to] of media) await cp(join(ROOT, from), join(OUT, to))
await Bun.write(join(OUT, '.nojekyll'), '')
console.log(`site/dist: ${scriptName} (${(script.length / 1024).toFixed(0)} KB), ${styleName}`)
