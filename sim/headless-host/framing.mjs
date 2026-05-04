export class FrameReader {
  constructor(stream) {
    this.stream = stream;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.ended = false;
    stream.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    stream.on("end", () => {
      this.ended = true;
      for (const waiter of this.waiters.splice(0)) waiter(null);
    });
  }

  next() {
    const frame = this.tryRead();
    if (frame) return Promise.resolve(frame);
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  drain() {
    while (this.waiters.length > 0) {
      const frame = this.tryRead();
      if (!frame) return;
      this.waiters.shift()(frame);
    }
  }

  tryRead() {
    if (this.buffer.length < 4) return null;
    const len = this.buffer.readUInt32LE(0);
    if (this.buffer.length < 4 + len) return null;
    const body = this.buffer.subarray(4, 4 + len);
    this.buffer = this.buffer.subarray(4 + len);
    return JSON.parse(body.toString("utf8"));
  }
}

export function writeFrame(stream, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  stream.write(Buffer.concat([header, body]));
}
