import type { Options } from 'prettier'
import type { Prettier } from './prettier'

import prettier from 'prettier/esm/standalone.mjs'
// import parserBabel from 'prettier/esm/parser-babel.mjs'
// import parserHtml from 'prettier/esm/parser-html.mjs'
// import parserMarkdown from 'prettier/esm/parser-markdown.mjs'
// import parserPostcss from 'prettier/esm/parser-postcss.mjs'
// import parserTypescript from 'prettier/esm/parser-typescript.mjs'


const defaults = {
  printWidth: 80,
  useTabs: false,
  semi: false,
  trailingComma: 'all',
  bracketSameLine: false,
}

export const Layer = {
  /**
   * 1. `default` (public)
   */
  d /* efaults */: 0b000 << 27 /* Shifts.layer */,

  /**
   * 2. `base` (public) — for things like reset rules or default styles applied to plain HTML elements.
   */
  b /* ase */: 0b001 << 27 /* Shifts.layer */,

  /**
   * 3. `components` (public, used by `style()`) — is for class-based styles that you want to be able to override with utilities.
   */
  c /* omponents */: 0b010 << 27 /* Shifts.layer */,
  // reserved for style():
  // - props: 0b011
  // - when: 0b100

  /**
   * 6. `aliases` (public, used by `apply()`) — `~(...)`
   */
  a /* liases */: 0b101 << 27 /* Shifts.layer */,

  /**
   * 6. `utilities` (public) — for small, single-purpose classes
   */
  u /* tilities */: 0b110 << 27 /* Shifts.layer */,

  /**
   * 7. `overrides` (public, used by `css()`)
   */
  o /* verrides */: 0b111 << 27 /* Shifts.layer */,
} as const

const plugins = [
  {
    detect: (parser: string) =>
      /^[mc]?jsx?$/.test(parser)
        ? 'babel'
        : /^[mc]?tsx?$/.test(parser)
        ? 'babel-ts'
        : /^json5?$/.test(parser) && parser,
    load: () => import('prettier/esm/parser-babel.mjs').then((m) => m.default),
  },
  {
    detect: (parser: string) => /^html?$/.test(parser) && 'html',
    load: () => import('prettier/esm/parser-html.mjs').then((m) => m.default),
  },
  {
    detect: (parser: string) => /^(le|s?c)ss$/.test(parser) && parser,
    load: () => import('prettier/esm/parser-postcss.mjs').then((m) => m.default),
  },
]

async function getOptions(options?: Options) {
  let parser = options?.parser || /(?:\.([^.]+))?$/.exec(options?.filepath || '')?.[1]

  if (typeof parser === 'string') {
    for (const plugin of plugins) {
      const found = plugin.detect(parser)
      if (found) {
        return {
          ...defaults,
          ...options,
          parser: found,
          plugins: [await plugin.load()],
        }
      }
    }
  }

  return {
    ...defaults,
    ...options,
    plugins: Promise.all(plugins.map((plugin) => plugin.load())),
  }
}

const api: Prettier = {
  async format(source, options) {
    return prettier.format(source, await getOptions(options))
  },

  async formatWithCursor(source, options) {
    return prettier.formatWithCursor(source, await getOptions(options))
  },

  async formatPreviewCSS(rules) {
    let source = ''
    let lastLayerName = ''
    for (const rule of rules) {
      const match = rule.match(/^\/\*!([\da-z]+),([\da-z]+)(?:,(.+?))?\*\//)

      if (match) {
        const style = rule.slice(match[0].length)
        const precedence = parseInt(match[1], 36)
        // const name = match[3]
        const layer = precedence & Layer.o
        const layerName =
          layer === Layer.d
            ? 'defaults'
            : layer === Layer.b
            ? 'base'
            : layer === Layer.c
            ? 'components'
            : layer === Layer.a
            ? 'aliases'
            : layer === Layer.u
            ? 'utilities'
            : 'overrides'

        if (lastLayerName !== layerName) {
          // if (lastLayerName) {
          //   source += `/* } */\n`
          // }
          lastLayerName = layerName
          source += `\n\n/* @layer ${layerName} */\n\n`
        }

        // if (name) {
        //   source += `/* ${name} */\n`
        // }
        source += `${style}\n`
      } else {
        source += `${rule}\n`
      }
    }

    // if (lastLayerName) {
    //   source += `/* } */\n`
    // }

    return this.format(source, { parser: 'css' })
  },
}

export default api
