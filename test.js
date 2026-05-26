const test = require('brittle')
const {
  CAPABILITY_LEN,
  HEADER_LEN,
  MODE_TUNNEL,
  MODE_PROBE,
  encodeHeader,
  decodeHeader,
  encodeProbeResponse,
  decodeProbeResponse
} = require('./index.js')

test('constants', function (t) {
  t.is(CAPABILITY_LEN, 32)
  t.is(HEADER_LEN, 33)
  t.is(MODE_TUNNEL, 0)
  t.is(MODE_PROBE, 1)
})

test('encodeHeader - tunnel mode', function (t) {
  const cap = Buffer.alloc(32, 0xab)
  const header = encodeHeader(cap, MODE_TUNNEL)

  t.is(header.length, HEADER_LEN)
  t.alike(Buffer.from(header.subarray(0, 32)), cap)
  t.is(header[32], MODE_TUNNEL)
})

test('encodeHeader - probe mode', function (t) {
  const cap = Buffer.alloc(32, 0xff)
  const header = encodeHeader(cap, MODE_PROBE)

  t.is(header[32], MODE_PROBE)
})

test('encodeHeader - rejects wrong capability length', function (t) {
  t.exception(() => encodeHeader(Buffer.alloc(16), 0), /capability must be 32 bytes/)
  t.exception(() => encodeHeader(Buffer.alloc(0), 0), /capability must be 32 bytes/)
  t.exception(() => encodeHeader(Buffer.alloc(64), 0), /capability must be 32 bytes/)
})

test('encodeHeader - rejects invalid mode', function (t) {
  const cap = Buffer.alloc(32)
  t.exception(() => encodeHeader(cap, -1), /mode must be a byte/)
  t.exception(() => encodeHeader(cap, 256), /mode must be a byte/)
  t.exception(() => encodeHeader(cap, 1.5), /mode must be a byte/)
  t.exception(() => encodeHeader(cap, NaN), /mode must be a byte/)
})

test('decodeHeader - round trip', function (t) {
  const cap = Buffer.alloc(32)
  for (let i = 0; i < 32; i++) cap[i] = i

  const encoded = encodeHeader(cap, MODE_PROBE)
  const decoded = decodeHeader(encoded)

  t.alike(Buffer.from(decoded.capability), cap)
  t.is(decoded.mode, MODE_PROBE)
  t.is(decoded.leftover.length, 0)
})

test('decodeHeader - with leftover bytes', function (t) {
  const cap = Buffer.alloc(32, 0x01)
  const header = encodeHeader(cap, MODE_TUNNEL)
  const extra = Buffer.from([0xde, 0xad])
  const combined = Buffer.concat([header, extra])

  const decoded = decodeHeader(combined)
  t.alike(decoded.leftover, extra)
})

test('decodeHeader - returns null on short input', function (t) {
  t.is(decodeHeader(Buffer.alloc(0)), null)
  t.is(decodeHeader(Buffer.alloc(32)), null)
})

test('encodeProbeResponse - defaults', function (t) {
  const probe = encodeProbeResponse()

  t.is(probe[0], 0)
  t.is(probe[1], 0)
  t.is(probe[2], 0)
  t.is(probe[3], 0)
  t.is(probe.length, 4)
})

test('encodeProbeResponse - with host and port', function (t) {
  const probe = encodeProbeResponse({ port: 8080, host: '127.0.0.1' })

  t.is((probe[0] << 8) | probe[1], 8080)
  t.is(probe[2], 0)
  t.is(probe[3], 9)
  t.is(probe.length, 4 + 9)
})

test('encodeProbeResponse - udp flag', function (t) {
  const probe = encodeProbeResponse({ udp: true })
  t.is(probe[2], 1)

  const probe2 = encodeProbeResponse({ udp: false })
  t.is(probe2[2], 0)
})

test('encodeProbeResponse - rejects host over 255 bytes', function (t) {
  const longHost = 'a'.repeat(256)
  t.exception(() => encodeProbeResponse({ host: longHost }), /host exceeds 255 bytes/)
})

test('encodeProbeResponse - rejects invalid port', function (t) {
  t.exception(() => encodeProbeResponse({ port: -1 }), /port must fit in uint16/)
  t.exception(() => encodeProbeResponse({ port: 0x10000 }), /port must fit in uint16/)
})

test('decodeProbeResponse - round trip', function (t) {
  const original = { port: 443, host: 'example.com', udp: false }
  const encoded = encodeProbeResponse(original)
  const decoded = decodeProbeResponse(encoded)

  t.is(decoded.port, 443)
  t.is(decoded.host, 'example.com')
  t.is(decoded.udp, false)
  t.is(decoded.leftover.length, 0)
})

test('decodeProbeResponse - udp round trip', function (t) {
  const encoded = encodeProbeResponse({ port: 53, host: '8.8.8.8', udp: true })
  const decoded = decodeProbeResponse(encoded)

  t.is(decoded.port, 53)
  t.is(decoded.host, '8.8.8.8')
  t.is(decoded.udp, true)
})

test('decodeProbeResponse - with leftover bytes', function (t) {
  const encoded = encodeProbeResponse({ port: 80, host: 'localhost' })
  const extra = Buffer.from([0x01, 0x02, 0x03])
  const combined = Buffer.concat([encoded, extra])

  const decoded = decodeProbeResponse(combined)
  t.alike(decoded.leftover, extra)
})

test('decodeProbeResponse - returns null on short input', function (t) {
  t.is(decodeProbeResponse(Buffer.alloc(0)), null)
  t.is(decodeProbeResponse(Buffer.alloc(3)), null)
})

test('decodeProbeResponse - returns null when host is truncated', function (t) {
  const buf = Buffer.from([0x00, 0x50, 0x00, 0x05, 0x61])
  t.is(decodeProbeResponse(buf), null)
})

test('full header + probe round trip', function (t) {
  const cap = Buffer.alloc(32, 0xcc)
  const header = encodeHeader(cap, MODE_PROBE)
  const probe = encodeProbeResponse({ port: 9999, host: '10.0.0.1', udp: true })
  const wire = Buffer.concat([header, probe])

  const h = decodeHeader(wire)
  t.is(h.mode, MODE_PROBE)
  t.alike(h.capability, cap)

  const p = decodeProbeResponse(h.leftover)
  t.is(p.port, 9999)
  t.is(p.host, '10.0.0.1')
  t.is(p.udp, true)
  t.is(p.leftover.length, 0)
})

test('encodeProbeResponse - empty host', function (t) {
  const encoded = encodeProbeResponse({ port: 1234, host: '' })
  const decoded = decodeProbeResponse(encoded)

  t.is(decoded.port, 1234)
  t.is(decoded.host, '')
})

test('encodeProbeResponse - max valid port', function (t) {
  const encoded = encodeProbeResponse({ port: 65535 })
  const decoded = decodeProbeResponse(encoded)

  t.is(decoded.port, 65535)
})

test('encodeHeader - max valid mode byte', function (t) {
  const cap = Buffer.alloc(32)
  const header = encodeHeader(cap, 255)
  t.is(header[32], 255)
})
