# Instrucciones para HTTPS local (opcional)

## Generar certificados SSL
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

## Modificar server.js para HTTPS
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(options, app);

## Acceder con:
https://192.168.100.161:3000 (aceptar certificado no seguro)