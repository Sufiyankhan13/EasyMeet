import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { useParams } from 'react-router-dom';
import { Badge, IconButton, TextField, Box, Card, CardContent, Typography, Grid, Paper, Avatar, Button, CircularProgress } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import "../styles/videocomponent.css";
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import server from '../environment';

const server_url = server;

var connections = {};

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" },
        { "urls": "turn:global.turn.metered.ca:80", "username": "openrelayproject", "credential": "openrelayproject" },
        { "urls": "turn:global.turn.metered.ca:443", "username": "openrelayproject", "credential": "openrelayproject" },
        { "urls": "turn:global.turn.metered.ca:443?transport=tcp", "username": "openrelayproject", "credential": "openrelayproject" }
    ]
}

export default function VideoMeetComponent() {
    const { url } = useParams();

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoref = useRef();
    let backgroundVideoRef = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);
    let [audioAvailable, setAudioAvailable] = useState(true);
    let [video, setVideo] = useState(true);
    let [audio, setAudio] = useState(true);
    let [screen, setScreen] = useState();
    let [showModal, setModal] = useState(false);
    let [screenAvailable, setScreenAvailable] = useState();
    let [messages, setMessages] = useState([])
    let [message, setMessage] = useState("");
    let [newMessages, setNewMessages] = useState(0);
    
    // New States for Admit/Deny
    let [meetState, setMeetState] = useState("lobby"); // lobby, waiting, joined
    let [isAdmin, setIsAdmin] = useState(false);
    let [joinRequests, setJoinRequests] = useState([]);
    
    let [username, setUsername] = useState("");
    let [myId, setMyId] = useState("");
    const videoRef = useRef([])
    let [videos, setVideos] = useState([])

    useEffect(() => {
        getPermissions();
    }, [])

    let getDislayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDislayMediaSuccess)
                    .then((stream) => { })
                    .catch((e) => console.log(e))
            }
        }
    }

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
            });
            if (videoPermission) {
                setVideoAvailable(true);
            } else {
                setVideoAvailable(false);
            }

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (audioPermission) {
                setAudioAvailable(true);
            } else {
                setAudioAvailable(false);
            }

            if (navigator.mediaDevices.getDisplayMedia) {
                setScreenAvailable(true);
            } else {
                setScreenAvailable(false);
            }

            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
                    audio: audioAvailable 
                });
                if (userMediaStream) {
                    window.localStream = userMediaStream;
                    if (localVideoref.current) {
                        localVideoref.current.srcObject = userMediaStream;
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [video, audio])

    useEffect(() => {
        if (localVideoref.current && window.localStream) {
            localVideoref.current.srcObject = window.localStream;
        }
    }, [meetState]) // Re-attach on state change

    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    let getUserMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        if (localVideoref.current) localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false);
            setAudio(false);

            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream

            for (let id in connections) {
                connections[id].addStream(window.localStream)
                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                        })
                        .catch(e => console.log(e))
                })
            }
        })
    }

    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ 
                video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false, 
                audio: audio 
            })
                .then(getUserMediaSuccess)
                .then((stream) => { })
                .catch((e) => console.log(e))
        } else {
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { }
        }
    }

    let getDislayMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream
            getUserMedia()
        })
    }

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }))
                            }).catch(e => console.log(e))
                        }).catch(e => console.log(e))
                    }
                }).catch(e => console.log(e))
            }

            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', url)
            socketIdRef.current = socketRef.current.id
            setMyId(socketRef.current.id);
        })

        // NEW: Waiting Room Logic
        socketRef.current.on('you-are-admin', () => {
            setIsAdmin(true);
            setMeetState("joined");
        });

        socketRef.current.on('waiting-for-approval', () => {
            setMeetState("waiting");
        });

        socketRef.current.on('request-accepted', () => {
            setMeetState("joined");
        });

        socketRef.current.on('request-rejected', () => {
            alert("Host rejected your request.");
            setMeetState("lobby");
            window.location.href = "/"; // Redirect to home
        });

        socketRef.current.on('request-to-join', (socketId) => {
            setJoinRequests(prev => {
                if(prev.includes(socketId)) return prev;
                return [...prev, socketId];
            });
        });

        // Regular Events
        socketRef.current.on('chat-message', addMessage)
        socketRef.current.on('user-left', (id) => {
            setVideos((videos) => videos.filter((video) => video.socketId !== id))
        })
        socketRef.current.on('user-joined', (id, clients) => {
            clients.forEach((socketListId) => {
                connections[socketListId] = new RTCPeerConnection(peerConfigConnections)
                connections[socketListId].onicecandidate = function (event) {
                    if (event.candidate != null) {
                        socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
                    }
                }
                connections[socketListId].onaddstream = (event) => {
                    let videoExists = videoRef.current.find(video => video.socketId === socketListId);
                    if (videoExists) {
                        setVideos(videos => {
                            const updatedVideos = videos.map(video =>
                                video.socketId === socketListId ? { ...video, stream: event.stream } : video
                            );
                            videoRef.current = updatedVideos;
                            return updatedVideos;
                        });
                    } else {
                        let newVideo = {
                            socketId: socketListId,
                            stream: event.stream,
                            autoplay: true,
                            playsinline: true
                        };
                        setVideos(videos => {
                            const updatedVideos = [...videos, newVideo];
                            videoRef.current = updatedVideos;
                            return updatedVideos;
                        });
                    }
                };
                if (window.localStream !== undefined && window.localStream !== null) {
                    connections[socketListId].addStream(window.localStream)
                } else {
                    let blackSilence = (...args) => new MediaStream([black(...args), silence()])
                    window.localStream = blackSilence()
                    connections[socketListId].addStream(window.localStream)
                }
            })
            if (id === socketIdRef.current) {
                for (let id2 in connections) {
                    if (id2 === socketIdRef.current) continue
                    try { connections[id2].addStream(window.localStream) } catch (e) { }
                    connections[id2].createOffer().then((description) => {
                        connections[id2].setLocalDescription(description)
                            .then(() => {
                                socketRef.current.emit('signal', id2, JSON.stringify({ 'sdp': connections[id2].localDescription }))
                            })
                            .catch(e => console.log(e))
                    })
                }
            }
        })
    }

    let silence = () => {
        let ctx = new AudioContext()
        let oscillator = ctx.createOscillator()
        let dst = oscillator.connect(ctx.createMediaStreamDestination())
        oscillator.start()
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }
    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height })
        canvas.getContext('2d').fillRect(0, 0, width, height)
        let stream = canvas.captureStream()
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    let handleVideo = () => setVideo(!video);
    let handleAudio = () => setAudio(!audio);
    
    useEffect(() => { if (screen !== undefined) getDislayMedia(); }, [screen])
    let handleScreen = () => setScreen(!screen);
    let handleEndCall = () => {
        try {
            let tracks = localVideoref.current.srcObject.getTracks()
            tracks.forEach(track => track.stop())
        } catch (e) { }
        window.location.href = "/"
    }
    let openChat = () => { setModal(true); setNewMessages(0); }
    let closeChat = () => setModal(false);
    let handleMessage = (e) => setMessage(e.target.value);
    
    const addMessage = (data, sender, socketIdSender) => {
        setMessages((prevMessages) => [...prevMessages, { sender: sender, data: data }]);
        if (socketIdSender !== socketIdRef.current) setNewMessages((prevNewMessages) => prevNewMessages + 1);
    };
    const sendMessage = () => {
        socketRef.current.emit('chat-message', message, username)
        setMessage("");
    }
    const handleAccept = (requestSocketId) => {
        socketRef.current.emit("accept-request", requestSocketId, url);
        setJoinRequests(prev => prev.filter(id => id !== requestSocketId));
    }
    const handleReject = (requestSocketId) => {
        socketRef.current.emit("reject-request", requestSocketId, url);
        setJoinRequests(prev => prev.filter(id => id !== requestSocketId));
    }

    let connect = () => {
        // setAskForUsername(false); // OLD Logic
        getMedia(); // Connects to socket
        // State transition happens via socket events
    }

    // RENDER LOGIC
    if (meetState === "waiting") {
        return (
            <Box sx={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', bgcolor: '#1f1c2c', color: 'white' }}>
                <CircularProgress color="secondary" />
                <Typography variant="h5" sx={{ mt: 3 }}>Waiting for host to admit you...</Typography>
            </Box>
        );
    }

    if (meetState === "lobby") {
        return (
             <div style={{ 
                background: 'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)', 
                height: '100vh', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center' 
            }}>
                <Card elevation={10} sx={{ maxWidth: 500, width: '90%', borderRadius: 4, p: 2, bgcolor: 'rgba(255,255,255,0.95)' }}>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 'bold', color: '#333' }}>
                            Ready to join?
                        </Typography>
                        <Box sx={{ width: '100%', height: 300, bgcolor: '#000', borderRadius: 3, overflow: 'hidden', mb: 3, position: 'relative' }}>
                            <video ref={localVideoref} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </Box>
                        <TextField fullWidth label="Enter your name" variant="outlined" value={username} onChange={e => setUsername(e.target.value)} sx={{ mb: 2 }} />
                        <Button variant="contained" size="large" onClick={connect} fullWidth disabled={!username.trim()} sx={{ py: 1.5, borderRadius: 2 }}>
                            Join Meeting
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // JOINED VIEW
    return (
        <div className="meetVideoContainer">
            
            {/* REQUEST POPUP FOR ADMIN */}
            {isAdmin && joinRequests.length > 0 && (
                <Paper elevation={6} sx={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, p: 2, bgcolor: 'white', borderLeft: '5px solid #ff9800' }}>
                    <Typography variant="subtitle1" fontWeight="bold">Join Request</Typography>
                    {joinRequests.map((id, index) => (
                        <Box key={index} sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                            <Typography variant="body2">User {id.slice(0,4)}... wants to join</Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button size="small" variant="contained" color="success" onClick={() => handleAccept(id)}>Admit</Button>
                                <Button size="small" variant="contained" color="error" onClick={() => handleReject(id)}>Deny</Button>
                            </Box>
                        </Box>
                    ))}
                </Paper>
            )}

            <div className="conferenceMainArea">
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: videos.length === 0 ? '1fr' : videos.length <= 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                    gap: '15px', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <video className="meetUserVideo" ref={localVideoref} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px', backgroundColor: '#202124' }}></video>
                        <span style={{position:'absolute', bottom: 10, left: 10, background:'rgba(0,0,0,0.5)', color:'white', padding:'5px 10px', borderRadius:'5px', fontSize:'12px'}}>You {isAdmin ? "(Host)" : ""}</span>
                    </div>
                    {videos.map((video) => (
                        <div key={video.socketId} style={{ position: 'relative', width: '100%', height: '100%' }}>
                            <video className="meetUserVideo" data-socket={video.socketId} ref={ref => { if (ref && video.stream) ref.srcObject = video.stream; }} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px', backgroundColor: '#202124' }}></video>
                            <span style={{position:'absolute', bottom: 10, left: 10, background:'rgba(0,0,0,0.5)', color:'white', padding:'5px 10px', borderRadius:'5px', fontSize:'12px'}}>User</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="buttonContainers">
                <div className="meetingInfo">
                    <h3>Meeting Details</h3>
                    <p onClick={() => {navigator.clipboard.writeText(window.location.href); alert("Link Copied!")}}>{window.location.href}</p>
                </div>
                <IconButton onClick={handleVideo} style={{ color: "white" }}>{(video === true) ? <VideocamIcon /> : <VideocamOffIcon />}</IconButton>
                <IconButton onClick={handleEndCall} style={{ color: "red" }}><CallEndIcon /></IconButton>
                <IconButton onClick={handleAudio} style={{ color: "white" }}>{audio === true ? <MicIcon /> : <MicOffIcon />}</IconButton>
                {screenAvailable === true ? <IconButton onClick={handleScreen} style={{ color: "white" }}>{screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}</IconButton> : <></>}
                <Badge badgeContent={newMessages} max={999} color='orange'>
                    <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}><ChatIcon /></IconButton>
                </Badge>
                <div className="socketIdDisplay">ID: {myId}</div>
            </div>

            {showModal ? <div className="chatRoom">
                <div className="chatContainer">
                    <h1>Chat</h1>
                    <div className="chattingDisplay">
                        {messages.length !== 0 ? messages.map((item, index) => {
                            return (<div style={{ marginBottom: "20px" }} key={index}><p style={{ fontWeight: "bold" }}>{item.sender}</p><p>{item.data}</p></div>)
                        }) : <p>No Messages Yet</p>}
                    </div>
                    <div className="chattingArea">
                        <TextField value={message} onChange={(e) => setMessage(e.target.value)} id="outlined-basic" label="Enter Your chat" variant="outlined" />
                        <Button variant='contained' onClick={sendMessage}>Send</Button>
                    </div>
                </div>
            </div> : <></>}
        </div>
    )
}