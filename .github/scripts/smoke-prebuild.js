// Verify the bundled prebuild for THIS platform actually loads, before it is
// ever published. Run with PREBUILDS_ONLY=1 so node-gyp-build cannot fall back
// to the build/Release tree that prebuildify leaves behind on the runner --
// without it this would happily pass while testing the wrong file.
//
// Lives in a file rather than inline in the workflow because the Alpine job
// runs its build inside `docker run ... sh -c '...'`, where any single quote
// in an inline `node -e` snippet would terminate the surrounding shell string.

const path = require('path')
const root = path.join(__dirname, '..', '..')

if (process.env.PREBUILDS_ONLY !== '1') {
  console.error('refusing to run: PREBUILDS_ONLY=1 is required, otherwise this')
  console.error('may resolve build/Release instead of the bundled prebuild')
  process.exit(1)
}

const resolved = require('node-gyp-build').path(root)
console.log('resolved ->', resolved)

if (path.relative(root, resolved).split(path.sep)[0] !== 'prebuilds') {
  console.error('resolved outside prebuilds/, refusing to pass')
  process.exit(1)
}

const sql = require(path.join(root, 'lib', 'sql.js'))
const exported = Object.keys(sql).length
console.log('loaded ok, exports:', exported)

if (exported === 0) {
  console.error('module loaded but exported nothing')
  process.exit(1)
}
