const net = require('net');

/**
 * Parse the SNI hostname from a TLS ClientHello buffer.
 * Returns the hostname string, or null if not found.
 */
function parseSNI(buf) {
  if (buf.length < 5 || buf[0] !== 0x16) return null;

  const recordLen = buf.readUInt16BE(3);
  const end = Math.min(buf.length, 5 + recordLen);

  let pos = 5; // past TLS record header

  if (pos + 4 > end) return null;
  if (buf[pos] !== 0x01) return null; // not ClientHello
  pos += 4; // skip HandshakeType (1) + length (3)

  pos += 2;  // skip client version
  pos += 32; // skip random

  // Skip SessionID
  if (pos + 1 > end) return null;
  const sidLen = buf[pos];
  pos += 1 + sidLen;

  // Skip CipherSuites
  if (pos + 2 > end) return null;
  const csLen = buf.readUInt16BE(pos);
  pos += 2 + csLen;

  // Skip CompressionMethods
  if (pos + 1 > end) return null;
  const cmLen = buf[pos];
  pos += 1 + cmLen;

  // Extensions
  if (pos + 2 > end) return null;
  const extTotalLen = buf.readUInt16BE(pos);
  pos += 2;
  const extEnd = Math.min(end, pos + extTotalLen);

  while (pos + 4 <= extEnd) {
    const extType = buf.readUInt16BE(pos);
    const extDataLen = buf.readUInt16BE(pos + 2);
    pos += 4;

    if (extType === 0x0000) {
      // SNI extension
      if (pos + 2 > extEnd) return null;
      pos += 2; // skip ServerNameList length

      if (pos + 3 > extEnd) return null;
      const nameType = buf[pos];
      const nameLen = buf.readUInt16BE(pos + 1);
      pos += 3;

      if (nameType === 0x00 && pos + nameLen <= end) {
        return buf.toString('ascii', pos, pos + nameLen);
      }
      return null;
    }

    pos += extDataLen;
  }

  return null;
}

/**
 * Create an SNI-routing TCP proxy server.
 * routeMap: { hostname: localPort }
 */
function createSNIProxy(routeMap, logger) {
  const server = net.createServer({ pauseOnConnect: true }, (clientSocket) => {
    clientSocket.once('data', (firstChunk) => {
      const hostname = parseSNI(firstChunk);

      if (!hostname || !routeMap[hostname]) {
        logger(`[SNI] Unknown or missing SNI: ${hostname || '(none)'}`);
        clientSocket.destroy();
        return;
      }

      const targetPort = routeMap[hostname];
      logger(`[SNI] ${hostname} -> 127.0.0.1:${targetPort}`);

      const tunnel = net.createConnection(targetPort, '127.0.0.1', () => {
        tunnel.write(firstChunk);
        clientSocket.pipe(tunnel);
        tunnel.pipe(clientSocket);
      });

      tunnel.on('error', (err) => {
        logger(`[SNI] Tunnel connection error for ${hostname}: ${err.message}`);
        clientSocket.destroy();
      });

      clientSocket.on('error', (err) => {
        logger(`[SNI] Client error for ${hostname}: ${err.message}`);
        tunnel.destroy();
      });
    });

    clientSocket.resume();
  });

  return server;
}

module.exports = { createSNIProxy, parseSNI };
