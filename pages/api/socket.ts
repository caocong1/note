import {Server} from 'socket.io'

let input: string
let peers: string[] = []
let streamingPeerId: string

const SocketHandler = (_req: any, res: any) => {
    if (res.socket.server.io) {
        console.log('Socket is already running')
    } else {
        console.log('Socket is initializing')
        const io = new Server(res.socket.server, {
            maxHttpBufferSize: 1e8,
        })

        res.socket.server.io = io

        io.on('connection', socket => {
            let uuid: string
            console.log('connection')
            // socket.join(uuid)
            // io.to(uuid).emit('init', {uuid, input})
            // let peerId: string

            socket.on('join', id => {
                console.log('join', id)
                uuid = id
                peers.push(uuid)
                socket.emit('init', input)
                io.emit('update-peers', peers)
            })

            socket.on('input-change', msg => {
                input = msg
                // socket.broadcast.except(peerId).emit('update-input', msg)
            })

            // socket.on('add-peer', id => {
            //     console.log('new peer', id)
            //     peerId = id
            //     // socket.join(peerId)
            //     peers.push(peerId)
            //     socket.emit('init', input)
            //     io.emit('update-peers', peers)
            //     console.log('peers', peers)
            //     // socket.broadcast.except(uuid).emit('update-input', msg)
            // })

            socket.on('start-stream', id => {
                console.log('start-stream', id)
                streamingPeerId = id
                socket.broadcast.emit('start-streaming', id)
            })
            socket.on('stop-stream', id => {
                console.log('stop-stream', id)
                streamingPeerId = ''
                socket.broadcast.emit('stop-streaming')
                // socket.broadcast.emit('streaming', id)
            })

            socket.on('disconnect', () => {
                console.log('disconnect', uuid)
                peers = peers.filter(peer => peer !== uuid)
                io.emit('update-peers', peers)
                if (streamingPeerId === uuid) {
                    streamingPeerId = ''
                    socket.broadcast.emit('stop-streaming')
                }
            })
        })
    }
    res.end()
}

export default SocketHandler
