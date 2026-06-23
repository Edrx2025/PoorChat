class NotificationService {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  notify(eventName, recipients, data) {
    this.eventBus.emit(eventName, {
      recipients: [...new Set(recipients)],
      data,
    });
  }
}

module.exports = NotificationService;
