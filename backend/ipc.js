/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2023-2025 Toha <tohenk@yahoo.com>
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

const debug = require('debug')('identity:ipc');
const Stringify = require('@ntlab/ntlib/stringify');

class IPC {

    handle(cmds, callback) {
        const { ipcMain } = require('electron');
        cmds.forEach(channel => {
            ipcMain.handle(channel, async (event, data) => {
                if (this.webContents !== event.sender) {
                    this.webContents = event.sender;
                }
                const res = await callback(channel, data);
                this.log(`${channel} done with ${Stringify.from(res)}`);
                return res;
            });
        });
    }

    send(message, data) {
        if (this.webContents) {
            this.webContents.send(message, data);
        }
    }

    onstart() {
        this.log('IPC is ready to serve');
    }

    log(...args) {
        if (this.parent) {
            this.parent.log(...args);
        } else {
            debug(...args);
        }
    }
}

module.exports = IPC;