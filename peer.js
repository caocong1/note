const { PeerServer } = require("peer");

PeerServer({ port: 23334, path: "/", ssl: {key: '', cert: ''} });

console.log('peerServer start')
