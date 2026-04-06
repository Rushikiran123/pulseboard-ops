const crypto = require('crypto');

function makeId() {
  return crypto.randomBytes(12).toString('hex');
}

function matchFilter(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (['_id', 'organizationId', 'ruleId', 'eventId'].includes(key)) {
      return String(doc[key]) === String(expected);
    }
    if (expected instanceof RegExp) {
      return typeof doc[key] === 'string' && expected.test(doc[key]);
    }
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && '$gte' in expected) {
      return new Date(doc[key]) >= new Date(expected.$gte);
    }
    return doc[key] === expected;
  });
}

/**
 * A minimal in-memory stand-in for a Mongoose model, implementing just the
 * query surface pulseboard-ops' routes/services actually use. Lets the HTTP
 * layer be exercised with real Express + Supertest while keeping the unit
 * suite fully offline (no MongoDB process required).
 */
function createFakeModel() {
  const store = [];

  function wrapDoc(doc) {
    const wrapped = doc;
    wrapped.toObject = () => {
      const { toObject, save, ...rest } = wrapped;
      return { ...rest };
    };
    wrapped.save = async () => {
      const idx = store.findIndex((d) => d._id === wrapped._id);
      if (idx >= 0) store[idx] = wrapped;
      return wrapped;
    };
    return wrapped;
  }

  const model = {
    __store: store,
    __reset() {
      store.length = 0;
    },
    async create(data) {
      const doc = wrapDoc({ _id: makeId(), createdAt: new Date(), updatedAt: new Date(), ...data });
      store.push(doc);
      return doc;
    },
    async find(filter = {}) {
      return store.filter((d) => matchFilter(d, filter)).map(wrapDoc);
    },
    async findOne(filter = {}) {
      const doc = store.find((d) => matchFilter(d, filter));
      return doc ? wrapDoc(doc) : null;
    },
    async findById(id) {
      if (!id) return null;
      const doc = store.find((d) => String(d._id) === String(id));
      return doc ? wrapDoc(doc) : null;
    },
    async findOneAndUpdate(filter, update, opts = {}) {
      const idx = store.findIndex((d) => matchFilter(d, filter));
      if (idx < 0) return null;
      store[idx] = { ...store[idx], ...update, updatedAt: new Date() };
      return wrapDoc(store[idx]);
    },
    async findByIdAndUpdate(id, update) {
      const idx = store.findIndex((d) => String(d._id) === String(id));
      if (idx < 0) return null;
      store[idx] = { ...store[idx], ...update, updatedAt: new Date() };
      return wrapDoc(store[idx]);
    },
    async findOneAndDelete(filter) {
      const idx = store.findIndex((d) => matchFilter(d, filter));
      if (idx < 0) return null;
      const [removed] = store.splice(idx, 1);
      return wrapDoc(removed);
    },
    async countDocuments(filter = {}) {
      return store.filter((d) => matchFilter(d, filter)).length;
    },
  };

  return model;
}

module.exports = { createFakeModel, makeId };
