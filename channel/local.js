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

const Channel = require('./index');
const Queue = require('@ntlab/work/queue');
const util = require('util');
const debug = require('debug')('identity:channel:local');

class Local extends Channel {

    init() {
        this.worker = this.options.worker;
        this.maxWorks = this.options.maxWorks;
        this.maxWorker = this.options.maxWorker || require('os').cpus().length;
        this.keepWorker = typeof this.options.keep !== 'undefined' ? this.options.keep : true;
        this.hasConfidence = this.options.hasConfidence;
        this.workers = [];
        this.processing = [];
    }

    add(id, data) {
        if (!this.has(id)) {
            this.templates.set(id, this.normalize(data));
            return true;
        }
        return false;
    }

    remove(id) {
        if (this.has(id)) {
            this.templates.delete(id);
            return true;
        }
        return false;
    }

    has(id) {
        return this.templates.has(id);
    }

    count() {
        return this.templates.size;
    }

    clear() {
        this.templates.clear();
    }

    identify(id, feature) {
        return new Promise((resolve, reject) => {
            if (!this.templates.size) {
                return resolve({ref: id, data: null});
            }
            const workers = [];
            const workId = this.genId();
            const ids = Array.from(this.templates.keys());
            const items = Array.from(this.templates.values());
            const maxlen = this.maxWorks > 0 ? this.maxWorks : ids.length;
            const count = Math.ceil(ids.length / maxlen);
            this.log('Starting identify %s with %d sample(s) for %s', workId, items.length, id);
            const sequences = Array.from({length: count}, (_, x) => x + 1);
            const work = {
                id: workId,
                items,
                feature: this.normalize(feature),
                start: Date.now(),
            }
            const result = {matched: null};
            const cleanwork = (worker, exit, reason) => {
                if (worker) {
                    worker.removeAllListeners();
                    if (workers.indexOf(worker) >= 0) {
                        workers.splice(workers.indexOf(worker), 1);
                    }
                    if (this.processing.indexOf(worker) >= 0) {
                        this.processing.splice(this.processing.indexOf(worker), 1);
                    }
                    if (exit) {
                        if (this.workers.indexOf(worker) >= 0) {
                            this.workers.splice(this.workers.indexOf(worker), 1);
                        }
                    }
                }
            }
            let confidence;
            const q = new Queue(sequences, seq => {
                const start = (seq - 1) * maxlen;
                const end = Math.min(start + maxlen, ids.length) - 1;
                const worker = this.getWorker(ids, cleanwork, () => q.next(), res => {
                    if (res) {
                        if (res.matched) {
                            if (typeof res.matched === 'object') {
                                if (this.hasConfidence && res.matched.confidence) {
                                    if (confidence === undefined || res.matched.confidence > confidence) {
                                        confidence = res.matched.confidence;
                                        res.matched = res.matched.label;
                                    } else {
                                        delete res.matched;
                                    }
                                } else {
                                    if (res.matched.label) {
                                        res.matched = res.matched.label;
                                    }
                                }
                            }
                        }
                        Object.assign(result, res);
                    }
                    q.done();
                });
                if (worker) {
                    workers.push(worker);
                    this.doWork(worker, {cmd: 'do', work, start, end});
                }
                if (!work.finish) {
                    q.next();
                }
            }, () => {
                return workers.length < this.maxWorker && !work.finish;
            });
            q.once('done', () => {
                // notify to stop when a matched is already found
                if (result.matched !== null && !this.hasConfidence) {
                    for (let i = 0; i < workers.length; i++) {
                        this.doWork(workers[i], {cmd: 'stop'});
                    }
                }
                // wait for on going work
                let count = workers.length;
                let workdone;
                (workdone = () => {
                    if (!workers.length) {
                        work.finish = Date.now();
                        if (result.matched !== null) {
                            result.matched = ids[result.matched];
                        }
                        this.log('Done %s in %d ms, match is %s for %s', workId, work.finish - work.start,
                            result.matched !== null ? result.matched : 'none', id);
                        resolve({ref: id, id: workId, data: result});
                     } else {
                         if (count !== workers.length) {
                             count = workers.length;
                             this.log('Still waiting %s ... %d worker(s) to finish for %s', workId, count, id);
                         }
                         setTimeout(workdone, 50);
                     }
                })();
            });
        });
    }

    handleMessage(worker, ids, onclean, next, done) {
        const cleanup = () => {
            worker.removeAllListeners();
            return worker;
        }
        cleanup()
            .on('message', data => {
                switch (data.cmd) {
                    case 'done':
                        onclean(worker, !this.keepWorker, 'done');
                        debug(`Worker ${data.worker}: ${data.work.id} done with ${data.matched === null ? 'NULL' : util.inspect(data.matched)}`);
                        if (data.matched !== null) {
                            done({matched: data.matched});
                        } else {
                            next();
                        }
                        break;
                    case 'update':
                        if (data.index !== undefined && data.data !== undefined) {
                            const id = ids[data.index];
                            if (data.data === null) {
                                this.templates.delete(id);
                            } else {
                                this.templates.set(id, data.data);
                            }
                        }
                        break;
                }
            })
            .on('error', err => onclean(worker, !this.keepWorker, err))
            .on('exit', code => onclean(worker, true, code));
    }

    getWorker(ids, onclean, next, done) {
        const worker = this.createWorker();
        if (worker) {
            this.handleMessage(worker, ids, onclean, next, done);
        }
        return worker;
    }

    createWorker() {
    }

    doWork(worker, data) {
    }
}

module.exports = Local;