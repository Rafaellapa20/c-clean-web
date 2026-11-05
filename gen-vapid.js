import { webcrypto } from 'crypto'
const { subtle } = webcrypto

const key = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
const rawPub = await subtle.exportKey('raw', key.publicKey)
const pkcs8Priv = await subtle.exportKey('pkcs8', key.privateKey)

// raw public key = 65 bytes (04 || x || y)
const pubB64 = Buffer.from(rawPub).toString('base64url')

// pkcs8 private: skip 36-byte header to get 32-byte raw key
const privB64 = Buffer.from(pkcs8Priv).slice(36, 68).toString('base64url')

console.log('VAPID_PUBLIC_KEY=' + pubB64)
console.log('VAPID_PRIVATE_KEY=' + privB64)
