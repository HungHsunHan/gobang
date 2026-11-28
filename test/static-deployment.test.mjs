import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Cloudflare serves game assets directly and sends room endpoints to the Worker', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'gobang');
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.assets.directory, './public');
  assert.equal(config.main, './worker.mjs');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/api/rooms', '/api/rooms/*']);
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'ROOMS', class_name: 'GameRoom' }]);
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['GameRoom'] }]);
});

test('Cloudflare sends the same content type protection as the local server', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /^\/\*\r?\n  X-Content-Type-Options: nosniff$/m);
});

test('the game settings offer only computer and online room play', () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const settings = page.match(/aria-label="選擇對手">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const choices = [...settings.matchAll(/<button\b[^>]*>([^<]+)<\/button>/g)]
    .map(([, label]) => label);

  assert.deepEqual(choices, ['對戰電腦', '連線對戰']);
});
