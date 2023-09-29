/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2023 Toha <tohenk@yahoo.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const debug = require('debug')('identity:socket');

class Socket {

    clients = []

    constructor(options) {
        this.options = options;
    }

    handle(cmds, callback) {
        this.cmds = cmds;
        this.callback = callback;
    }

    send(message, data) {
        this.clients.forEach(socket => {
            socket.emit(message, data);
        });
    }

    onstart() {
        const io = Socket.factory(this.options);
        const http = this.options.http;
        const namespace = `/${this.options.namespace ? this.options.namespace : ''}`;
        io.of(namespace)
            .on('connection', socket => {
                this.handleConnection(socket);
            });
        const addr = http.address();
        const url = `${addr.port === 443 ? 'https' : 'http'}://${addr.family === 'IPv6' ? '[' + addr.address + ']' : addr.address}${addr.port !== 80 && addr.port !== 443 ? ':' + addr.port : ''}${namespace}`; 
        this.log('Socket connection ready on %s', url);
    }

    handleConnection(socket) {
        if (this.clients.indexOf(socket) < 0) {
            this.clients.push(socket);
        }
        this.log('%s> connected', socket.id);
        socket
            .on('disconnect', () => {
                this.log('%s> disconnected', socket.id);
                const idx = this.clients.indexOf(socket);
                if (idx >= 0) {
                    this.clients.splice(idx, 1);
                }
            });
        this.cmds.forEach(channel => {
            socket.on(channel, async data => {
                this.log('%s> handle message: %s', socket.id, channel);
                if (typeof this.options.onrequest === 'function') {
                    this.options.onrequest(socket, channel, data);
                }
                const res = await this.callback(channel, data);
                if (res !== undefined) {
                    if (typeof this.options.onresponse === 'function') {
                        this.options.onresponse(socket, channel, data, res, () => {
                            socket.emit(channel, res);
                        });
                    } else {
                        socket.emit(channel, res);
                    }
                }
            });
        });
    }

    log() {
        const args = Array.from(arguments);
        if (this.parent) {
            this.parent.log(...args);
        } else {
            debug(...args);
        }
    }

    static factory(options) {
        if (Socket.io === undefined) {
            const { Server } = require('socket.io');
            const http = options.http;
            if (!http) {
                throw new Error('HTTP server must be passed in options!');
            }
            const config = options.config || {};
            if (!config.cors) {
                config.cors = {origin: '*'};
            }
            Socket.io = new Server(http, config);
        }
        return Socket.io;
    }
}

module.exports = Socket;