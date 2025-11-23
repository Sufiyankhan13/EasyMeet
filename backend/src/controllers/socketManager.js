import { Server } from "socket.io"


let connections = {}
let messages = {}
let timeOnline = {}
let admins = {} // Track room admins

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });


    io.on("connection", (socket) => {

        console.log("SOMETHING CONNECTED")

        socket.on("join-call", (path) => {

            if (connections[path] === undefined || connections[path].length === 0) {
                // First user is admin
                admins[path] = socket.id;
                
                if (connections[path] === undefined) {
                    connections[path] = []
                }
                
                connections[path].push(socket.id)
                timeOnline[socket.id] = new Date();
                
                // Notify they are admin
                socket.emit("you-are-admin");

                // Regular join logic (for themselves)
                for (let a = 0; a < connections[path].length; a++) {
                    io.to(connections[path][a]).emit("user-joined", socket.id, connections[path])
                }
            } else {
                // Room exists
                if (admins[path]) {
                    // Ask admin for permission
                    io.to(admins[path]).emit("request-to-join", socket.id);
                    socket.emit("waiting-for-approval");
                } else {
                    // Fallback (no admin tracked), just join
                    connections[path].push(socket.id)
                    timeOnline[socket.id] = new Date();
                    for (let a = 0; a < connections[path].length; a++) {
                        io.to(connections[path][a]).emit("user-joined", socket.id, connections[path])
                    }
                }
            }

            // Send messages history if they join directly
            if (messages[path] !== undefined && connections[path].includes(socket.id)) {
                for (let a = 0; a < messages[path].length; ++a) {
                    io.to(socket.id).emit("chat-message", messages[path][a]['data'],
                        messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
                }
            }
        })

        // Handle Admission
        socket.on("accept-request", (socketId, path) => {
            if (admins[path] === socket.id) {
                // Add the user to the room
                if (connections[path] === undefined) connections[path] = [];
                
                connections[path].push(socketId);
                timeOnline[socketId] = new Date();

                // Notify user they are accepted
                io.to(socketId).emit("request-accepted");

                // Trigger join logic for everyone
                for (let a = 0; a < connections[path].length; a++) {
                    io.to(connections[path][a]).emit("user-joined", socketId, connections[path])
                }
                
                // Send messages history
                 if (messages[path] !== undefined) {
                    for (let a = 0; a < messages[path].length; ++a) {
                        io.to(socketId).emit("chat-message", messages[path][a]['data'],
                            messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
                    }
                }
            }
        });

        socket.on("reject-request", (socketId, path) => {
             if (admins[path] === socket.id) {
                 io.to(socketId).emit("request-rejected");
             }
        });

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        })

        socket.on("chat-message", (data, sender) => {

            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {


                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }

                    return [room, isFound];

                }, ['', false]);

            if (found === true) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = []
                }

                messages[matchingRoom].push({ 'sender': sender, "data": data, "socket-id-sender": socket.id })
                console.log("message", matchingRoom, ":", sender, data)

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", data, sender, socket.id)
                })
            }

        })

        socket.on("disconnect", () => {

            var diffTime = Math.abs(timeOnline[socket.id] - new Date())

            var key

            for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {

                for (let a = 0; a < v.length; ++a) {
                    if (v[a] === socket.id) {
                        key = k

                        for (let a = 0; a < connections[key].length; ++a) {
                            io.to(connections[key][a]).emit('user-left', socket.id)
                        }

                        var index = connections[key].indexOf(socket.id)

                        connections[key].splice(index, 1)


                        if (connections[key].length === 0) {
                            delete connections[key]
                            delete admins[key] // Clean up admin
                        } else {
                            // If admin left, assign new admin
                            if (admins[key] === socket.id) {
                                admins[key] = connections[key][0];
                                io.to(admins[key]).emit("you-are-admin");
                            }
                        }
                    }
                }

            }


        })


    })


    return io;
}