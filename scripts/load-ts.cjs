const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

module.exports = function createLoader(mocks = {}) {
  const modules = new Map()
  function load(file) {
    file = path.resolve(file)
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }
    modules.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const localRequire = id => {
      if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id]
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(file), id)
        return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
      }
      return require(id)
    }
    new Function('require', 'module', 'exports', 'fetch', code)(localRequire, module, module.exports, mocks.fetch || global.fetch)
    return module.exports
  }
  return load
}
