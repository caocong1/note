import {useCallback, useEffect} from 'react'
import io, {Socket} from 'socket.io-client'
import Peer from "peerjs";

let socket: Socket;
let peer: Peer
let peers: string[] = []
let videoStream: MediaStream
const files: Record<string, File> = {}

const Home = () => {
    const setVideo = useCallback((stream: MediaStream) => {
        const video = document.getElementById("video") as HTMLVideoElement;
        if (video) {
            video.style.display = 'block'
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play().then();
            };
        }
    }, [])
    useEffect(() => {
        fetch('/api/socket').then(() => {
            socket = io()

            socket.on('init', msg => {
            //    console.log('init', msg)
                const el = document.getElementById('content')
                if (msg && el) {
                    el.innerHTML = msg
                }
            })

            socket.on('connect', () => {
                console.log('connected')
                socket.emit('join')
            })

            // socket.on('update-input', msg => {
            //     console.log('update', msg)
            //     // setInput(msg)
            //     //   (ref.current as any)?.innerHTML = msg
            //     const el = document.getElementById('content')
            //     if (el) el.innerHTML = msg
            // })

            socket.on('update-peers', res => {
            //    console.log('update-peers', res)
                peers = res
                peers.forEach((peerId) => {
                    if (peerId === peer.id) return
                    const call = peer.call(peerId, videoStream);
                    //console.log(call)
                    //if (call) {
                        //call.on('stream', function (remoteStream) {
                            //console.log('update-peers call stream', remoteStream)
                            // Show stream in some video/canvas element.
                        //})
                    //}
                })
            })

            import("peerjs").then(({default: Peer}) => {
                peer = new Peer({
                    host: '/',
                    port: 23334,
                    // path: '/api',
                })
                peer.on('open', function (id) {
                    console.log('My peer ID is: ' + id);
                    socket.emit('add-peer', id)
                })
                peer.on('call', function (call) {
                    //console.log('peer call')
                    navigator.mediaDevices.getUserMedia({video: true, audio: false}).then(function (stream) {
                        call.answer(stream); // Answer the call with an A/V stream.
                        call.on('stream', function (remoteStream) {
                            //console.log('call stream', remoteStream)
                            setVideo(remoteStream)
                            // Show stream in some video/canvas element.
                        });
                    });
                })
                peer.on('connection', function (conn) {
                    //console.log('peer connection', conn)
                    conn.on('data', data => {
                        //console.log('peer connection data', data)
                        const {type} = data as any
                        if (type === 'request-file') {
                            const {filename, peerId} = data as any
                            if (filename && files[filename]) {
                                const file = files[filename]
                                const sendFileConn = peer.connect(peerId);
                                sendFileConn.on('open', function () {
                                    file.arrayBuffer().then((buffer) => {
                                        //console.log(buffer)
                                        let blob = new Blob([buffer], {type: file.type });
                                    //     sendFileConn.send(buffer)
                                        sendFileConn.send({type: 'send-file', filename: file.name, buffer, filetype: file.type});
                                        // sendFileConn.close()
                                    })
                                })
                            }
                        } else if (type === 'html') {
                            const {content} = data as any
                            const el = document.getElementById('content')
                            if (el) el.innerHTML = content as string
                        } else if (type === 'send-file') {
                            const {filename,filetype, buffer} = data as any
                            // console.log('send-file', filename, buffer)
                            const blob = new Blob([buffer], {type: filetype });
                            const a = document.createElement('a')
                            a.href = window.URL.createObjectURL(blob);
                            a.download = filename
                            a.click()
                        }
                        // conn.close()
                    })
                })
                // peer.on('disconnected', function() {
                //     console.log('peer disconnected')
                //     socket.emit('remove-peer', peer.id)
                // })
            })
        })
        document.addEventListener('drop', (event) => {
            //console.log('event drop', event)
            event.preventDefault()
            if (event.dataTransfer?.files?.length) {
                for (let i = 0; i < event.dataTransfer.files.length; i++) {
                    // console.log(event.dataTransfer.files[i])
                    const file = event.dataTransfer.files[i]
                    files[file.name] = file
                    //console.log(file)
                    const el = document.getElementById('content')
                    if (!el) return
                    const a = document.createElement('a')
                    a.href = 'javascript:void(0)'
                    a.download = file.name
                    a.innerText = file.name
                    a.dataset.peerId = peer.id
                    a.className = 'file'
                    const div = document.createElement('div')
                    a.contentEditable = 'false'
                    div.appendChild(a)
                    el.appendChild(div)

                    socket.emit('input-change', el.innerHTML)
                    peers.forEach((peerId) => {
                        if (peerId === peer.id) return
                        const conn = peer.connect(peerId);
                        conn.on('open', function () {
                            conn.send({type: 'html', content: el.innerHTML});
                            // conn.close()
                        })
                    })
                    // File转base64
                    // const reader = new FileReader()
                    // reader.readAsDataURL(file)
                    // reader.onload = function (e) {
                    //     const el = document.getElementById('content')
                    //     if (!el) return
                    //     const a = document.createElement('a')
                    //     a.href = e.target?.result as string
                    //     a.download = file.name
                    //     a.innerText = file.name
                    //     const div = document.createElement('div')
                    //     a.contentEditable = 'false'
                    //     div.appendChild(a)
                    //     el.appendChild(div)
                    //     socket.emit('input-change', el.innerHTML)
                    // }
                }
            }
        })
        document.addEventListener('dragover', (event) => {
            // console.log('event dragover', event)
            event.preventDefault()
        })

        document.addEventListener('click', (event) => {
            //console.log(event.target)
            const el = event.target as HTMLElement
            if (el && el.tagName === 'A' && el.className === 'file') {
                const remotePeerId = el.dataset.peerId
                if (remotePeerId && remotePeerId !== peer.id) {
                    const conn = peer.connect(remotePeerId);
                    conn.on('open', function () {
                        conn.send({type: 'request-file', filename: el.innerText, peerId: peer.id});
                        // conn.close()
                    })
                }
            }
        })
    }, [setVideo])

    return (
        <>
            <div
                id="content"
                contentEditable
                style={{width: '100vw', height: '100vh', boxSizing: 'border-box', padding: 8}}
                onInput={(e: any) => {
                    socket.emit('input-change', e.target.innerHTML)
                    peers.forEach((peerId) => {
                        if (peerId === peer.id) return
                        const conn = peer.connect(peerId);
                        conn.on('open', function () {
                            conn.send({type: 'html', content: e.target.innerHTML});
                            // conn.close()
                        })
                    })
                }}
            />
            <button style={{position: 'absolute', bottom: 40, right: 20,}} onClick={() => {
                navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                })
                    .then(function (stream) {
                        //console.log(stream, peers)
                        setVideo(stream)
                        videoStream = stream
                        peers.forEach((peerId) => {
                            if (peerId === peer.id) return
                            peer.call(peerId, stream);
                            // if(call){
                            //     call && call.on('stream', function (remoteStream) {
                            //         console.log('call stream', remoteStream)
                            //         // Show stream in some video/canvas element.
                            //     })
                            // }
                        })
                        // add this stream to your peer
                        // peer.call()
                        // setOpenVideo(true)
                        // const call = peer.call('another-peers-id', stream);
                        // call.on('stream', function(remoteStream) {
                        // Show stream in some video/canvas element.

                        // });
                    }).catch((e) => {
                    console.log('getDisplayMedia error', e)
                })
            }}>
                共享屏幕
            </button>
            <video id="video"
                   style={{position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', display: 'none'}}/>
        </>
    )
}

export default Home
