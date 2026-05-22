const { TextEncoder, TextDecoder } = require('bare-encoding')

const CAPABILITY_LEN = 32
const HEADER_LEN = CAPABILITY_LEN + 1

const MODE_TUNNEL = 0
const MODE_PROBE = 1

const PROBE_FIXED_LEN = 4
const MAX_HOST_LEN = 255

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder('utf-8')

function encodeHeader(capability, mode) {
  if (capability.length !== CAPABILITY_LEN) {
    throw new Error(`capability must be ${CAPABILITY_LEN} bytes`)
  }
  if (!Number.isInteger(mode) || mode < 0 || mode > 255) {
    throw new Error('mode must be a byte (0-255)')
  }
  const out = new Uint8Array(HEADER_LEN)
  out.set(capability, 0)
  out[CAPABILITY_LEN] = mode
  return out
}

function decodeHeader(bytes) {
  if (bytes.length < HEADER_LEN) return null
  return {
    capability: bytes.subarray(0, CAPABILITY_LEN),
    mode: bytes[CAPABILITY_LEN],
    leftover: bytes.subarray(HEADER_LEN)
  }
}

function encodeProbeResponse({ port = 0, host = '', udp = false } = {}) {
  const hostBytes = utf8Encoder.encode(String(host))
  if (hostBytes.length > MAX_HOST_LEN) {
    throw new Error(`host exceeds ${MAX_HOST_LEN} bytes`)
  }
  const portInt = +port | 0
  if (portInt < 0 || portInt > 0xffff) {
    throw new Error('port must fit in uint16')
  }
  const out = new Uint8Array(PROBE_FIXED_LEN + hostBytes.length)
  out[0] = (portInt >>> 8) & 0xff
  out[1] = portInt & 0xff
  out[2] = udp ? 1 : 0
  out[3] = hostBytes.length
  out.set(hostBytes, PROBE_FIXED_LEN)
  return out
}

function decodeProbeResponse(bytes) {
  if (bytes.length < PROBE_FIXED_LEN) return null
  const hostLen = bytes[3]
  const total = PROBE_FIXED_LEN + hostLen
  if (bytes.length < total) return null
  return {
    port: (bytes[0] << 8) | bytes[1],
    udp: bytes[2] === 1,
    host: utf8Decoder.decode(bytes.subarray(PROBE_FIXED_LEN, total)),
    leftover: bytes.subarray(total)
  }
}

module.exports = {
  CAPABILITY_LEN,
  HEADER_LEN,
  MODE_TUNNEL,
  MODE_PROBE,
  encodeHeader,
  decodeHeader,
  encodeProbeResponse,
  decodeProbeResponse
}
