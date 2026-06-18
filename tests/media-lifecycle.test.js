const test = require("node:test");
const assert = require("node:assert/strict");

function createElement() {
  const classes = new Set(["hidden"]);
  return {
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      },
      toggle(name, force) {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener() {},
    pause() {},
    srcObject: null,
    src: "",
    textContent: "",
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("la cámara se abre una sola vez y se detiene incluso si se cuelga durante getUserMedia", async () => {
  const elements = new Map();
  global.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, createElement());
      return elements.get(selector);
    },
  };
  global.window = {
    chad: {
      media: {
        onReceived() {},
      },
    },
    addEventListener() {},
  };

  let getUserMediaCalls = 0;
  const mediaRequest = deferred();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia() {
          getUserMediaCalls += 1;
          return mediaRequest.promise;
        },
      },
    },
  });

  global.MediaStream = class {
    constructor(tracks = []) {
      this.tracks = tracks;
    }

    getAudioTracks() {
      return this.tracks;
    }
  };
  global.MediaRecorder = class {
    constructor() {
      this.state = "inactive";
    }

    addEventListener() {}

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
    }
  };

  const [{ CallController }, { state }] = await Promise.all([
    import("../src/renderer/js/calls.js"),
    import("../src/renderer/js/state.js"),
  ]);

  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
  };
  const call = {
    id: 99,
    callType: "audio",
    status: "in_progress",
    callerId: 1,
    receiverId: 2,
  };

  state.currentUser = { id: 1 };
  state.activeCall = call;
  const controller = new CallController({ onCallsChanged() {} });

  const firstStart = controller.ensureMediaStarted(call);
  const duplicateStart = controller.ensureMediaStarted(call);
  assert.equal(getUserMediaCalls, 1);

  controller.closeCallOverlay();
  mediaRequest.resolve(stream);
  await Promise.all([firstStart, duplicateStart]);

  assert.equal(track.stopped, true);
  assert.equal(controller.stream, null);
  assert.equal(elements.get("#local-video").srcObject, null);

  delete global.document;
  delete global.window;
  delete global.navigator;
  delete global.MediaStream;
  delete global.MediaRecorder;
});

test("la llamada aceptada permanece minimizada hasta que el usuario la abre", async () => {
  const elements = new Map();
  global.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, createElement());
      return elements.get(selector);
    },
  };
  global.window = {
    chad: {
      media: {
        onReceived() {},
      },
    },
    addEventListener() {},
  };

  const [{ CallController }, { state }] = await Promise.all([
    import("../src/renderer/js/calls.js"),
    import("../src/renderer/js/state.js"),
  ]);
  const controller = new CallController({ onCallsChanged() {} });
  controller.ensureMediaStarted = async () => {};
  state.currentUser = { id: 1 };

  await controller.handleCallUpdate({
    id: 101,
    callType: "video",
    status: "in_progress",
    callerId: 1,
    receiverId: 2,
    receiverDisplayName: "User Two",
  });

  assert.equal(
    elements.get("#active-call-indicator").classList.contains("hidden"),
    false,
  );
  assert.equal(
    document.querySelector("#call-overlay").classList.contains("hidden"),
    true,
  );

  controller.openCallOverlay();
  assert.equal(
    elements.get("#call-overlay").classList.contains("hidden"),
    false,
  );
  controller.minimizeCallOverlay();
  assert.equal(
    elements.get("#call-overlay").classList.contains("hidden"),
    true,
  );

  state.activeCall = null;
  delete global.document;
  delete global.window;
});

test("el audio PCM recibido se programa en orden con Web Audio", async () => {
  const elements = new Map();
  global.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, createElement());
      return elements.get(selector);
    },
  };
  global.window = {
    chad: {
      media: {
        onReceived() {},
      },
    },
    addEventListener() {},
  };

  const { CallController } = await import("../src/renderer/js/calls.js");
  const controller = new CallController({ onCallsChanged() {} });
  const scheduled = [];
  let channelData = null;
  controller.audioContext = {
    currentTime: 2,
    destination: {},
    resume: () => Promise.resolve(),
    createBuffer(_channels, length, sampleRate) {
      channelData = new Float32Array(length);
      return {
        duration: length / sampleRate,
        getChannelData: () => channelData,
      };
    },
    createBufferSource() {
      return {
        connect() {},
        start(time) {
          scheduled.push(time);
        },
      };
    },
  };

  const samples = new Int16Array([32767, 0, -32768]);
  controller.playPcmAudio({
    sequence: 1,
    sampleRate: 16000,
    dataBase64: Buffer.from(samples.buffer).toString("base64"),
  });
  controller.playPcmAudio({
    sequence: 1,
    sampleRate: 16000,
    dataBase64: Buffer.from(samples.buffer).toString("base64"),
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0], 2.06);
  assert.ok(channelData[0] > 0.99);
  assert.equal(channelData[1], 0);
  assert.equal(channelData[2], -1);

  delete global.document;
  delete global.window;
});
