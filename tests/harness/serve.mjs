// Tiny static server for the harness pages (module scripts do not load from file://).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }

export function serve(root, port = 0) {
  const base = resolve(root)
  const server = createServer(async (req, res) => {
    const path = normalize(join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
    if (!path.startsWith(base)) return res.writeHead(403).end()
    try {
      const body = await readFile(path)
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}` })))
}
