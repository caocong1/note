import {Server} from 'socket.io'

let input: string
let peers: string[] = []

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
            // const uuid = uuidv4()
            // console.log('connection', uuid)
            // socket.join(uuid)
            // io.to(uuid).emit('init', {uuid, input})
            let peerId: string

            socket.on('input-change', msg => {
                input = msg
                // socket.broadcast.except(peerId).emit('update-input', msg)
            })

            socket.on('add-peer', id => {
                console.log('new peer', id)
                peerId = id
                // socket.join(peerId)
                peers.push(peerId)
                socket.emit('init', input)
                io.emit('update-peers', peers)
                console.log('peers', peers)
                // socket.broadcast.except(uuid).emit('update-input', msg)
            })

            // socket.on('remove-peer', id => {
            //
            // })

            socket.on('disconnect', () => {
                console.log('disconnect', peerId)
                peers = peers.filter(peer => peer !== peerId)
                io.emit('update-peers', peers)
            })
        })
    }
    res.end()
}

export default SocketHandler
