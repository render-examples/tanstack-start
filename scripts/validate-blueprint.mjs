import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import Ajv2020 from 'ajv/dist/2020.js'
import { parseDocument } from 'yaml'

const blueprintPath = new URL('../render.yaml', import.meta.url)
const schemaUrl = 'https://render.com/schema/render.yaml.json'

const expectedBlueprint = {
  services: [
    {
      type: 'web',
      name: 'tanstack-start',
      runtime: 'node',
      plan: 'free',
      buildCommand: 'npm ci --include=dev && npm run build',
      startCommand: 'node .output/server/index.mjs',
      healthCheckPath: '/health',
      autoDeployTrigger: 'off',
      envVars: [{ key: 'HOST', value: '0.0.0.0' }],
    },
  ],
}

const blueprintSource = await readFile(blueprintPath, 'utf8')
const blueprintDocument = parseDocument(blueprintSource, {
  maxAliasCount: 0,
  prettyErrors: true,
  strict: true,
  uniqueKeys: true,
})

assert.equal(
  blueprintDocument.errors.length,
  0,
  blueprintDocument.errors.map((error) => error.message).join('\n'),
)
assert.equal(
  blueprintDocument.warnings.length,
  0,
  blueprintDocument.warnings.map((warning) => warning.message).join('\n'),
)

const blueprint = blueprintDocument.toJS({ maxAliasCount: 0 })
const schemaResponse = await fetch(schemaUrl, {
  signal: AbortSignal.timeout(10_000),
})

assert.equal(
  schemaResponse.ok,
  true,
  `Could not download Render's Blueprint schema: ${schemaResponse.status} ${schemaResponse.statusText}`,
)

const schemaSource = await schemaResponse.text()
const schema = JSON.parse(schemaSource)
assert.equal(schema.$id, schemaUrl)
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')

// Render's schema intentionally applies some object keywords across `allOf` branches.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false })
ajv.addFormat('uri', (value) => URL.canParse(value))

const validate = ajv.compile(schema)

assert.equal(
  validate(blueprint),
  true,
  ajv.errorsText(validate.errors, { separator: '\n' }),
)

assert.deepEqual(
  blueprint,
  expectedBlueprint,
  'render.yaml no longer matches the intentionally minimal, secret-free policy.',
)

console.log(
  "Blueprint is valid against Render's current schema and the repository policy.",
)
