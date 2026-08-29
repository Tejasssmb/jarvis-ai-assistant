let pendingAction = null;

function setPendingAction(action) {
  pendingAction = action;
}

function getPendingAction() {
  return pendingAction;
}

function clearPendingAction() {
  pendingAction = null;
}

module.exports = {
  setPendingAction,
  getPendingAction,
  clearPendingAction
};