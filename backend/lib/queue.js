// ─────────────────────────────────────────────────────────────────────────────
// lib/queue.js
//
// Simple in-process async FIFO queue that mimics BullMQ / RabbitMQ behaviour.
// All jobs are processed by the registered worker function sequentially
// (or with controlled concurrency), decoupling the HTTP ingress from
// heavy SQLite writes.
//
// For production: swap this for BullMQ backed by Redis or amqplib (RabbitMQ).
// The interface (enqueue / process) stays identical.
// ─────────────────────────────────────────────────────────────────────────────
const { EventEmitter } = require('events');

class AsyncQueue extends EventEmitter {
  constructor(name, { concurrency = 1 } = {}) {
    super();
    this.name        = name;
    this.concurrency = concurrency;
    this._queue      = [];
    this._running    = 0;
    this._processor  = null;
  }

  /** Register the async function that processes each job */
  process(fn) {
    this._processor = fn;
    this._drain();
  }

  /** Add a job to the queue; returns a Promise that resolves when done */
  enqueue(data) {
    return new Promise((resolve, reject) => {
      this._queue.push({ data, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this._processor && this._running < this.concurrency && this._queue.length > 0) {
      const job = this._queue.shift();
      this._running++;
      Promise.resolve()
        .then(() => this._processor(job.data))
        .then((result) => {
          this._running--;
          job.resolve(result);
          this._drain();
        })
        .catch((err) => {
          this._running--;
          job.reject(err);
          this._drain();
        });
    }
  }

  get length() { return this._queue.length; }
}

// Singleton order queue — concurrency=5 mimics a 5-worker consumer pool
const orderQueue = new AsyncQueue('order-processing', { concurrency: 5 });

module.exports = { orderQueue };
