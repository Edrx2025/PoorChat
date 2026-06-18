const { EventEmitter } = require("events");

class EventBus extends EventEmitter {
  static getInstance() {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
      EventBus.instance.setMaxListeners(50);
    }

    return EventBus.instance;
  }
}

module.exports = EventBus;
