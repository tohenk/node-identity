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

const Local = require('./local');
const { Worker } = require('worker_threads');

class MultiWorker extends Local {

    createWorker() {
        let worker;
        // use idle worker if possible
        for (let i = 0; i < this.workers.length; i++) {
            if (this.processing.indexOf(this.workers[i]) < 0) {
                worker = this.workers[i];
                this.processing.push(worker);
                break;
            }
        }
        if (worker === undefined) {
            worker = new Worker(this.worker);
            this.workers.push(worker);
            this.processing.push(worker);
        }
        return worker;
    }

    doWork(worker, data) {
        worker.postMessage(data);
    }
}

module.exports = MultiWorker;