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

const crypto = require('crypto');
const util = require('util');
const ntutil = require('@ntlab/ntlib/util');

class Identity {

    ID_ACQUIRE = 1
    ID_ENROLL = 2
    ID_STOP = 3

    constructor(options) {
        this.options = options || {};
        this.mode = typeof options.mode !== 'undefined' ? options.mode : Identity.MODE_ALL;
        this.backend = options.backend;
        this.prefix = this.options.prefix;
        this.proxies = this.options.proxies || [];
        this.channelType = this.options.channelType || 'worker';
        this.logger = this.options.logger;
        this.onstatus = this.options.onstatus;
        this.resetted = false;
        this.init();
        this.start();
    }

    init() {
        this.commands = this.getCommands();
        if (this.backend) {
            this.backend.parent = this;
        }
    }

    start() {
        const cmds = [];
        if (this.commands) {
            const addCmds = xcmds => {
                xcmds.forEach(cmd => {
                    cmd = this.getPrefix(cmd);
                    if (cmds.indexOf(cmd) < 0) {
                        cmds.push(cmd);
                    } else {
                        console.error('Command %s:%s already registered!', this.constructor.name, cmd);
                    }
                });
            }
            if (this.commands[Identity.MODE_ALL]) {
                addCmds(Object.keys(this.commands[Identity.MODE_ALL]));
            }
            if ((this.mode === Identity.MODE_ALL || this.mode === Identity.MODE_BRIDGE) && this.commands[Identity.MODE_BRIDGE]) {
                addCmds(Object.keys(this.commands[Identity.MODE_BRIDGE]));
            }
            if ((this.mode === Identity.MODE_ALL || this.mode === Identity.MODE_VERIFIER) && this.commands[Identity.MODE_VERIFIER]) {
                addCmds(Object.keys(this.commands[Identity.MODE_VERIFIER]));
            }
        }
        if (this.backend) {
            this.backend.handle(cmds, async (cmd, data) => await this.doCmd(cmd, data));
            if (typeof this.backend.onstart === 'function') {
                this.backend.onstart();
            }
        }
    }

    finalize() {
    }

    getIdentifier() {
        if (!this.identifier) {
            const options = {
                normalize: data => this.normalizeTemplate(data),
                logger: (...args) => this.log(...args),
            }
            if (this.proxies.length) {
                Object.assign(options, {
                    worker: path.join(__dirname, 'worker', 'proxy'),
                    proxies: this.proxies,
                    serverid: this.proxyServerId,
                }, this.proxyOptions || {});
                const ChannelProxy = require('./channel/proxy');
                this.identifier = new ChannelProxy(options);
            } else {
                Object.assign(options, this.workerOptions || {});
                let ChannelClass;
                switch (this.channelType) {
                    case 'worker':
                        ChannelClass = require('./channel/worker');
                        break;
                    case 'cluster':
                        ChannelClass = require('./channel/cluster');
                        break;
                }
                if (!ChannelClass) {
                    throw new Error(`Unresolved channel type ${this.channelType}!`);
                }
                this.identifier = new ChannelClass(options);
            }
            if (this.id) {
                this.identifier.id = this.id;
            }
        }
        return this.identifier;
    }

    normalizePrefix(key) {
        if (this.prefix) {
            const prefix = this.getPrefix('');
            if (key.startsWith(prefix)) {
                key = key.substr(prefix.length);
            }
        }
        return key;
    }

    getPrefix(key) {
        return this.prefix ? `${this.prefix}-${key}` : key;
    }

    getCommands() {
    }

    getCmd(cmd) {
        let res;
        if (this.commands) {
            cmd = this.normalizePrefix(cmd);
            if (this.commands[Identity.MODE_ALL] && typeof this.commands[Identity.MODE_ALL][cmd] === 'function') {
                res = this.commands[Identity.MODE_ALL][cmd];
            }
            if (!res && (this.mode === Identity.MODE_ALL || this.mode === Identity.MODE_BRIDGE)) {
                if (this.commands[Identity.MODE_BRIDGE] && typeof this.commands[Identity.MODE_BRIDGE][cmd] === 'function') {
                    res = this.commands[Identity.MODE_BRIDGE][cmd];
                }
            }
            if (!res && (this.mode === Identity.MODE_ALL || this.mode === Identity.MODE_VERIFIER)) {
                if (this.commands[Identity.MODE_VERIFIER] && typeof this.commands[Identity.MODE_VERIFIER][cmd] === 'function') {
                    res = this.commands[Identity.MODE_VERIFIER][cmd];
                }
            }
        }
        return res;
    }

    async doCmd(cmd, data = {}) {
        const handler = this.getCmd(cmd);
        if (handler) {
            const res = {success: false};
            let retval = handler(data);
            if (retval instanceof Promise) {
                retval = await retval;
            }
            if (retval === true || retval === false) {
                res.success = retval;
            } else if (retval !== undefined) {
                res.success = true;
                if (typeof retval === 'object') {
                    Object.assign(res, retval);
                } else {
                    res.data = retval;
                }
            }
            return res;
        }
    }

    sendMessage(message, data) {
        if (this.backend) {
            this.backend.send(message, data);
        }
    }

    setStatus(status, priority = false) {
        if (typeof this.onstatus === 'function') {
            this.onstatus(status, priority);
        }
    }

    log() {
        const args = Array.from(arguments);
        const time = new Date();
        if (args.length) {
            let prefix = ntutil.formatDate(time, 'MM-dd HH:mm:ss.zzz');
            if (this.id) {
                prefix += ` ${this.id}>`;
            }
            args[0] = `${prefix} ${args[0]}`;
        }
        if (typeof this.logger === 'function') {
            const message = util.format(...args);
            this.logger(message);
        } else {
            console.log(...args);
        }
    }

    normalizeTemplate(data) {
        return data;
    }

    genId() {
        const shasum = crypto.createHash('sha1');
        shasum.update(new Date().getTime().toString());
        return shasum.digest('hex').substring(0, 8);
    }

    reset() {
        if (!this.resetted) {
            this.resetted = true;
            if (typeof this.onreset === 'function') {
                this.onreset();
            }
        }
    }

    static get MODE_ALL() {
        return 'ALL';
    }

    static get MODE_BRIDGE() {
        return 'BRIDGE';
    }

    static get MODE_VERIFIER() {
        return 'VERIFIER';
    }
}

module.exports = Identity;