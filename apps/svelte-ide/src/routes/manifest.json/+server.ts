import { twind, virtual } from '@twind/core'
import config from '../../twind.config'

const tw = twind(config, virtual())

export function GET(): ReturnType<import('./$types').RequestHandler> {
  return new Response(
    JSON.stringify({
      // "$schema": "https://json.schemastore.org/web-manifest-combined.json",
      name: 'Twind.run',
      short_name: 'Twind',
      description: `An advanced online playground for Twind that lets you use all of Twind's features directly in the browser.`,
      theme_color: '' + tw.theme('colors.brandDark.1'),
      background_color: '' + tw.theme('colors.brandDark.1'),
      display: 'standalone',
      scope: '/',
      icons: [
        {
          src: 'https://imagedelivery.net/clgAS5HJ8HoJM1G5J8tcLA/ad127ccc-64a5-4460-d429-39ba2ab6ea00/196x196',
          sizes: '196x196',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: 'https://imagedelivery.net/clgAS5HJ8HoJM1G5J8tcLA/ad127ccc-64a5-4460-d429-39ba2ab6ea00/512x512',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    }),
    {
      headers: {
        'content-type': 'application/manifest+json; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    },
  )
}
