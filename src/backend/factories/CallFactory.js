const { AudioCall, VideoCall } = require("../models/Call");

class CallFactory {
  static create(type, data) {
    if (type === "audio") return new AudioCall(data);
    if (type === "video") return new VideoCall(data);

    throw new Error(`Tipo de llamada no soportado: ${type}`);
  }
}

module.exports = CallFactory;
