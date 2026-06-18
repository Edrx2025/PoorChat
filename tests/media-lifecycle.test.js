const test = require("node:test");
const assert = require("node:assert/strict");

function createElement() {
  return {
    classList: {
      add() {},
      remove() {},
      toggle() {},
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
