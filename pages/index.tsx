import {useCallback, useEffect, useRef, useState} from 'react'
import io, {Socket} from 'socket.io-client'
import Peer from "peerjs";
import {v4 as uuidv4} from 'uuid'
import {Button, Modal, notification, Space} from "antd";
import Draggable from 'react-draggable';

let socket: Socket;
let uuid: string
let peer: Peer
// let peers: string[] = []
let videoStream: MediaStream | null = null
const files: Record<string, File> = {}
let streamingId: string
const chunkSize = 1024 * 1024 * 2

function PeerCallStream(peers: string[] = []) {
    console.log('PeerCallStream', peers, peer.id, uuid)
    peers.forEach((peerId) => {
        if (peerId === peer.id) return
        if (videoStream) {
            peer.call(peerId, videoStream);
        }
    })
}

function stopStream() {
    console.log('stopStream')
    const track = videoStream?.getTracks()[0];
    track?.stop()
    videoStream = null
    const video = document.getElementById("video") as HTMLVideoElement;
    if (video) {
        video.pause()
        video.style.display = 'none'
        video.srcObject = null;
    }
    const btn = document.getElementById("share-screen-btn") as HTMLButtonElement;
    if (btn) {
        btn.style.display = 'block'
    }
}

let globalPeers: string[] = []
const receiveFiles: { [filename: string]: Uint8Array } = {}

const Home = () => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const [openModal, setOpenModal] = useState(false)
    const [disabled, setDisabled] = useState(true);
    const dragRef = useRef<HTMLDivElement>(null);
    // const [bounds, setBounds] = useState({left: 0, top: 0, bottom: 0, right: 0});
    const [minModal, setMinModal] = useState(false)
    const [peers, setPeers] = useState<string[]>([])

    const showVideo = useCallback((stream: MediaStream) => {
        console.log('showVideo')
        setOpenModal(true)
        const video = document.getElementById("video") as HTMLVideoElement;
        if (video) {
            video.style.display = 'block'
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play().then();
            };
        }
        const btn = document.getElementById("share-screen-btn") as HTMLButtonElement;
        if (btn) {
            btn.style.display = 'none'
        }
    }, [])
    useEffect(() => {
        fetch('/api/socket').then(() => {
            socket = io()

            socket.on('init', (res) => {
                console.log('init')
                const el = document.getElementById('content')
                if (res.input && el) {
                    el.innerHTML = res.input
                }
                setPeers(res.peers)
                globalPeers = res.peers
            })

            socket.on('connect', () => {
                console.log('connected')
                if (localStorage.uuid) {
                    uuid = localStorage.uuid
                } else {
                    uuid = uuidv4()
                    localStorage.uuid = uuid
                }
                socket.emit('join', uuid)
                import("peerjs").then(({default: Peer}) => {
                    peer = new Peer(uuid, {
                        host: '/',
                        port: 23334,
                        // path: '/api',
                    })
                    peer.on('open', function (id) {
                        console.log('My peer ID is: ' + id);
                        // socket.emit('add-peer', id)
                    })
                    peer.on('call', function (call) {
                        console.log('peer call')
                        call.answer();
                        call.on('stream', function (remoteStream) {
                            console.log('call stream', remoteStream)
                            stopStream()
                            setOpenModal(false)
                            setMinModal(false)
                            Modal.confirm({
                                title: '提示',
                                content: '是否观看远程桌面共享？',
                                onOk() {
                                    showVideo(remoteStream)
                                },
                            })
                        });
                        // navigator.mediaDevices.getUserMedia({video: true, audio: false}).then(function (stream) {
                        //     call.answer(stream);
                        //     call.on('stream', function (remoteStream) {
                        //         //console.log('call stream', remoteStream)
                        //         showVideo(remoteStream)
                        //     });
                        // });
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
                                        sendFileConn.send({
                                            type: 'send-file-start',
                                            filename: file.name,
                                            filetype: file.type
                                        });
                                        file.arrayBuffer().then((buffer) => {
                                            //console.log(buffer)
                                            // let blob = new Blob([buffer], {type: file.type});
                                            //     sendFileConn.send(buffer)
                                            const size = buffer.byteLength
                                            let start = 0
                                            let end = size > chunkSize ? chunkSize : size
                                            let sendBuffer = buffer.slice(start, end)
                                            while (sendBuffer.byteLength > 0) {
                                                sendFileConn.send({
                                                    type: 'send-file',
                                                    filename: file.name,
                                                    buffer: sendBuffer,
                                                    start,
                                                    end,
                                                    size,
                                                });
                                                start = end
                                                end = size > start + chunkSize ? start + chunkSize : size
                                                sendBuffer = buffer.slice(start, end)
                                            }
                                            // sendFileConn.send({
                                            //     type: 'send-file',
                                            //     filename: file.name,
                                            //     buffer,
                                            //     filetype: file.type
                                            // });
                                            // sendFileConn.close()
                                        })
                                    })
                                } else {
                                    let element = document.querySelector(`[download="${filename}"]`);
                                    if (element) {
                                        element.remove();
                                    }
                                    const content = document.getElementById('content')
                                    if (content) {
                                        socket.emit('input-change', {peerId: peer.id, msg: content.innerHTML})
                                    }
                                    const sendFileConn = peer.connect(peerId);
                                    sendFileConn.on('open', function () {
                                        sendFileConn.send({type: 'send-file-error'});
                                    })
                                    notification.error({message: '文件不存在，请重新发送'})
                                }
                                // } else if (type === 'html') {
                                //     const {content} = data as any
                                //     const el = document.getElementById('content')
                                //     if (el) el.innerHTML = content as string
                            } else if (type === 'send-file') {
                                const {filename, filetype, buffer, start, end, size} = data as any
                                console.log('send-file', filename, start, end, size, buffer.byteLength)
                                if (start === 0) {
                                    receiveFiles[filename] = new Uint8Array(new Uint8Array(new ArrayBuffer(size)))
                                    console.log('receiveFiles[filename] length', receiveFiles[filename].byteLength)
                                }
                                receiveFiles[filename].set(new Uint8Array(buffer), start);
                                if (end === size) {
                                    const blob = new Blob([receiveFiles[filename]], {type: filetype});
                                    const a = document.createElement('a')
                                    a.href = window.URL.createObjectURL(blob);
                                    a.download = filename
                                    a.click()
                                    let element = document.querySelector(`[download="${filename}"]`);
                                    if (element) {
                                        element.innerHTML = filename + `(${Math.floor(end / size * 100)}%)`
                                    }
                                    delete receiveFiles[filename]
                                } else {
                                    let element = document.querySelector(`[download="${filename}"]`);
                                    if (element) {
                                        element.innerHTML = filename + `(${Math.floor(end / size * 100)}%)`
                                    }
                                }
                                // console.log('send-file', filename, buffer)
                            } else if (type === 'send-file-error') {
                                notification.error({message: '文件不存在，请重新发送'})
                            } else if (type === 'send-file-start') {
                                const {filename} = data as any
                                let element = document.querySelector(`[download="${filename}"]`);
                                if (element) {
                                    element.innerHTML = filename + '(开始下载)'
                                }
                            }
                            // conn.close()
                        })
                    })
                    // peer.on('disconnected', function() {
                    //     console.log('peer disconnected')
                    //     socket.emit('remove-peer', peer.id)
                    // })

                    socket.on('update-peers', res => {
                        //    console.log('update-peers', res)
                        // peers = res
                        setPeers(res)
                        globalPeers = res
                        PeerCallStream(res)
                    })
                })
            })

            socket.on('update-input', ({peerId, msg}) => {
                console.log('update-input', msg, peerId)
                // setInput(msg)
                //   (ref.current as any)?.innerHTML = msg
                if (peerId === peer.id || !peerId) return
                const el = document.getElementById('content')
                if (el) el.innerHTML = msg
            })


            socket.on('stop-streaming', () => {
                streamingId = ''
                //    console.log('update-peers', res)
                stopStream()
                setOpenModal(false)
                setMinModal(false)
            })

            socket.on('start-streaming', id => {
                //    console.log('update-peers', res)
                console.log('start-streaming', id)
                console.log('streamingId, peer.id', streamingId, peer.id)
                if (streamingId === peer.id && id === peer.id) {
                    console.log('start-streaming stream', videoStream?.getAudioTracks())
                    videoStream?.getAudioTracks()[0].stop()
                }
                streamingId = id
            })


        })
        document.addEventListener('drop', (event) => {
            //console.log('event drop', event)
            event.preventDefault()
            if (event.dataTransfer?.files?.length) {
                for (let i = 0; i < event.dataTransfer.files.length; i++) {
                    // console.log(event.dataTransfer.files[i])
                    const file = event.dataTransfer.files[i]
                    if (file.size > 1024 * 1024 * 1024 * 2) {
                        alert('文件大小不能超过2G')
                        continue
                    }
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

                    socket.emit('input-change', {peerId: peer.id, msg: el.innerHTML})
                    // peers.forEach((peerId) => {
                    //     if (peerId === peer.id) return
                    //     const conn = peer.connect(peerId);
                    //     conn.on('open', function () {
                    //         conn.send({type: 'html', content: el.innerHTML});
                    //         // conn.close()
                    //     })
                    // })
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
                if (remotePeerId === peer.id) {
                    return
                }
                if (remotePeerId && remotePeerId !== peer.id && globalPeers.includes(remotePeerId)) {
                    const conn = peer.connect(remotePeerId);
                    console.log(conn, globalPeers, remotePeerId)
                    if (conn) {
                        conn.on('open', function () {
                            conn.send({type: 'request-file', filename: el.innerText, peerId: peer.id});
                            // conn.close()
                        })
                    } else {
                        notification.error({message: '连接失败请重试'})
                    }
                } else {
                    notification.error({message: '找不到发送文件的用户id，请重新发送'})
                }
            }
        })
    }, [showVideo])

    const closeModal = useCallback(() => {
        // const videoTrack = videoStream?.getVideoTracks()[0];
        // videoTrack?.stop()
        if (streamingId === peer.id) {
            console.log('用户已停止屏幕共享');
            socket.emit('stop-stream', peer.id)
        } else {
            console.log('其他用户已停止屏幕共享');
        }
        setOpenModal(false)
        stopStream()
        setMinModal(false)
    }, [])

    if (!mounted) return <></>;
    return (
        <>
            <div
                id="content"
                contentEditable
                style={{width: '100vw', height: '100vh', boxSizing: 'border-box', padding: 8}}
                onInput={(e: any) => {
                    socket.emit('input-change', {peerId: peer.id, msg: e.target.innerHTML})
                    // peers.forEach((peerId) => {
                    //     if (peerId === peer.id) return
                    //     const conn = peer.connect(peerId);
                    //     conn.on('open', function () {
                    //         conn.send({type: 'html', content: e.target.innerHTML});
                    //         // conn.close()
                    //     })
                    // })
                }}
            />
            <div style={{
                position: 'absolute',
                bottom: 10,
                right: 20,
                fontSize: 12,
                color: '#00000070'
            }}>在线人数：{peers.length}</div>
            <Button id="share-screen-btn" style={{position: 'absolute', bottom: 40, right: 20,}} onClick={() => {
                navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    // video: {
                    //     width: {
                    //         ideal: 1920,
                    //         max: 1920,
                    //     },
                    //     height: {
                    //         ideal: 1080,
                    //         max: 1080,
                    //     }
                    // },
                    audio: false
                })
                    .then(function (stream) {
                        //console.log(stream, peers)
                        showVideo(stream)
                        videoStream = stream
                        PeerCallStream(peers)
                        streamingId = peer.id
                        socket.emit('start-stream', peer.id)
                        const videoTrack = stream.getVideoTracks()[0];

                        videoTrack.onended = () => {
                            if (streamingId === peer.id) {
                                console.log('用户已停止屏幕共享');
                                socket.emit('stop-stream', peer.id)
                            } else {
                                console.log('其他用户已停止屏幕共享');
                            }
                            // 这里可以执行一些清理或用户通知的操作
                            stopStream()
                            setOpenModal(false)
                            setMinModal(false)
                        };

                        // peers.forEach((peerId) => {
                        //     if (peerId === peer.id) return
                        //     peer.call(peerId, stream);
                        //     // if(call){
                        //     //     call && call.on('stream', function (remoteStream) {
                        //     //         console.log('call stream', remoteStream)
                        //     //         // Show stream in some video/canvas element.
                        //     //     })
                        //     // }
                        // })
                        // add this stream to your peer
                        // peer.call()
                        // setOpenVideo(true)
                        // const call = peer.call('another-peers-id', stream);
                        // call.on('stream', function(remoteStream) {
                        // Show stream in some video/canvas element.

                        // });
                    })
                    .catch((e) => {
                        console.log('getDisplayMedia error', e)
                    })
            }}>
                共享屏幕
            </Button>
            <Modal
                title={<div style={{display: 'flex', justifyContent: 'space-between'}}>
                    远程桌面
                    <Space>
                        {!minModal && <Button size="small" onClick={() => {
                            setMinModal(true)
                            const el = document.getElementById("video-container")
                            if (el) {
                                el.style.display = 'none'
                            }
                        }}>最小化</Button>}
                        {minModal && <Button size="small" onClick={() => {
                            setMinModal(false)
                            const el = document.getElementById("video-container")
                            if (el) {
                                el.style.display = 'block'
                            }
                        }}>恢复</Button>}
                        <Button size="small" onClick={() => {
                            const video = document.getElementById("video") as HTMLVideoElement;
                            if (video) {
                                video.requestFullscreen().then()
                            }
                        }}>全屏</Button>
                        <Button size="small" onClick={closeModal} danger>关闭</Button>
                    </Space>
                </div>}
                closeIcon={false}
                getContainer={false}
                open={openModal}
                forceRender
                footer={null}
                mask={false}
                maskClosable={false}
                onCancel={closeModal}
                modalRender={(modal) => (
                    <div
                        id="video-drag">
                        <Draggable
                            disabled={disabled}
                            // bounds={bounds}
                            nodeRef={dragRef}
                            // onStart={(event, uiData) => {
                            //     const {clientWidth, clientHeight} = window.document.documentElement;
                            //     const targetRect = dragRef.current?.getBoundingClientRect();
                            //     if (!targetRect) {
                            //         return;
                            //     }
                            //     setBounds({
                            //         left: -targetRect.left + uiData.x,
                            //         right: clientWidth - (targetRect.right - uiData.x),
                            //         top: -targetRect.top + uiData.y,
                            //         bottom: clientHeight - (targetRect.bottom - uiData.y),
                            //     });
                            // }}
                        >
                            <div ref={dragRef}>{modal}</div>
                        </Draggable>
                    </div>
                )}
                width="fit-content"
            >
                <div
                    id="video-container"
                    onMouseOver={() => {
                        setDisabled(true)
                    }}
                    onMouseOut={() => {
                        setDisabled(false)
                    }}
                    style={{
                        //     position: 'absolute',
                        //     top: 0,
                        //     left: 0,
                        width: 'calc(60vw - 48px)',
                        // height: '60vh',
                        // pointerEvents: 'none',
                        //     display: 'none'
                        resize: 'both',
                        overflow: 'scroll',
                    }}
                >
                    <video id="video"
                        // controls
                           style={{
                               //     position: 'absolute',
                               //     top: 0,
                               //     left: 0,
                               // width: 'calc(60vw - 48px)',
                               width: '100%',
                               // height: '60vh',
                               pointerEvents: 'none',
                               //     display: 'none'
                           }}
                    />
                </div>
            </Modal>
        </>
    )
}

export default Home
