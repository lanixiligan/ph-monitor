// Tests for the radio stream check: the judging rules, the 24-hour clock, and a
// real check against pretend stream servers on this computer (no internet).
// Run with: npm test

import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { AUDIO_BYTES, judgeRadio, nextFailingSince, probeRadio } from '../src/checker/checkRadio.ts';

const answer = (status: number, contentType: string | null, bytes: number) =>
  ({ kind: 'answer', status, contentType, bytes }) as const;

test('radio check: audio is ok; errors, web pages, playlists and silence fail', () => {
  assert.equal(judgeRadio(answer(200, 'audio/mpeg', AUDIO_BYTES)).status, 'ok');
  assert.equal(judgeRadio(answer(200, null, AUDIO_BYTES)).status, 'ok');
  assert.equal(judgeRadio(answer(404, 'audio/mpeg', 0)).note, 'HTTP 404');
  // Refused our checker: can't tell, so never counted as a failure.
  assert.equal(judgeRadio(answer(403, 'text/html', 0)).status, 'unchecked');
  assert.equal(judgeRadio(answer(401, null, 0)).status, 'unchecked');
  assert.equal(judgeRadio(answer(200, 'text/html; charset=utf-8', 5000)).status, 'failed');
  assert.equal(judgeRadio(answer(200, 'audio/x-mpegurl', 5000)).status, 'failed');
  assert.equal(judgeRadio(answer(200, 'audio/aacp', 10)).note, 'no audio came');
  assert.equal(judgeRadio({ kind: 'error', note: 'ECONNREFUSED', unreadable: false }).status, 'failed');
  assert.equal(judgeRadio({ kind: 'error', note: 'old Shoutcast', unreadable: true }).status, 'unchecked');
});

test('radio check: the failing clock starts once, and stops on success or "could not check"', () => {
  const then = new Date('2026-11-25T00:00:00Z');
  const now = new Date('2026-11-25T06:00:00Z');
  const failed = { status: 'failed', note: 'x' } as const;
  assert.equal(nextFailingSince(failed, null, now), now);
  assert.equal(nextFailingSince(failed, then, now), then);
  assert.equal(nextFailingSince({ status: 'ok', note: null }, then, now), null);
  assert.equal(nextFailingSince({ status: 'unchecked', note: 'x' }, then, now), null);
  assert.equal(nextFailingSince({ status: 'unchecked', note: 'x' }, null, now), null);
});

// Starts a pretend server, runs `body` with its address, then stops it.
async function withServer(server: net.Server, body: (base: string) => Promise<void>): Promise<void> {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  try {
    await body(`http://127.0.0.1:${port}`);
  } finally {
    // Pretend streams never end, so open connections are cut first.
    if (server instanceof http.Server) server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}

test('radio check: a never-ending stream is heard and hung up; a redirect is followed', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/old') {
      res.writeHead(302, { Location: '/live' }).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    // Sends audio for ever, like a real stream.
    const timer = setInterval(() => res.write(Buffer.alloc(512)), 5);
    res.on('close', () => clearInterval(timer));
  });
  await withServer(server, async (base) => {
    const probe = await probeRadio(`${base}/old`);
    assert.equal(probe.kind, 'answer');
    assert.equal(judgeRadio(probe).status, 'ok');
  });
});

test('radio check: too many redirects fail', async () => {
  const server = http.createServer((_req, res) => res.writeHead(302, { Location: '/again' }).end());
  await withServer(server, async (base) => {
    const probe = await probeRadio(`${base}/start`);
    assert.deepEqual(probe, { kind: 'error', note: 'more than 3 redirects', unreadable: false });
  });
});

test('radio check: an old Shoutcast "ICY 200 OK" reply is "could not check", not dead', async () => {
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.once('data', () => socket.end('ICY 200 OK\r\ncontent-type: audio/mpeg\r\n\r\n' + 'x'.repeat(2048)));
  });
  await withServer(server, async (base) => {
    assert.equal(judgeRadio(await probeRadio(`${base}/`)).status, 'unchecked');
  });
});
