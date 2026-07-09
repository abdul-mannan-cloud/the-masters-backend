import Counter from "../Models/Counter.js";

// Atomically returns the next number in a tenant-scoped sequence, creating
// the counter on first use. Pass a Mongoose session to make the increment
// roll back alongside whatever document it's numbering.
export const getNextSequence = async (tenantId, key, session) => {
  const counter = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );
  return counter.seq;
};
