const { PeerServer } = require("peer");
const fs = require('fs');

PeerServer({
  port: 23334,
  path: "/",
  ssl: process.env.SSL === 'false' ? undefined :{
    key: fs.readFileSync('/home/u/10.10.9.41-key.pem'),
    cert: fs.readFileSync('/home/u/10.10.9.41.pem')
  }
});

console.log('peerServer start')
