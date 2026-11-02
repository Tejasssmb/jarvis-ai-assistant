// A pending question ("Shall I send ...?") is only valid for a short time, so an old
// question can never be confirmed by an unrelated "yes" much later.
const TTL_MS = 90 * 1000;

let pending = null;
let setAt = 0;

function setPendingAction(action) {
  pending = action;
  setAt = Date.now();
}

function getPendingAction() {
  if (pending && Date.now() - setAt > TTL_MS) {
    pending = null;
  }
  return pending;
}

function clearPendingAction() {
  pending = null;
}

module.exports = {
  setPendingAction,
  getPendingAction,
  clearPendingAction
};
