export const state = {
  session: null,
  currentUser: null,
  users: [],
  privateChats: [],
  groups: [],
  calls: [],
  settings: null,
  activeView: "chats",
  activeContext: null,
  messages: [],
  loadingOlderMessages: false,
  hasMoreMessages: true,
  replyingTo: null,
  activeCall: null,
};

export function applyBootstrap(data) {
  state.currentUser = data.currentUser;
  state.users = data.users || [];
  state.privateChats = data.privateChats || [];
  state.groups = data.groups || [];
  state.calls = data.calls || [];
  state.settings = data.settings || null;
}

export function resetState() {
  state.session = null;
  state.currentUser = null;
  state.users = [];
  state.privateChats = [];
  state.groups = [];
  state.calls = [];
  state.settings = null;
  state.activeView = "chats";
  state.activeContext = null;
  state.messages = [];
  state.loadingOlderMessages = false;
  state.hasMoreMessages = true;
  state.replyingTo = null;
  state.activeCall = null;
}
