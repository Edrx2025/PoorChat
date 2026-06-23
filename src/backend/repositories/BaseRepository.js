class BaseRepository {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return this.database.prepare(sql);
  }
}

module.exports = BaseRepository;
